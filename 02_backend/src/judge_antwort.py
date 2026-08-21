"""Antwortqualität gegen den Fragenkatalog — die Hälfte, die das Retrieval nicht abdeckt.

eval.py misst deterministisch, ob die richtige Fundstelle gefunden wurde. Hier geht es um
das, was danach kommt: Gibt das Modell die Norm inhaltlich richtig wieder, nennt es die
Fundstelle, und erkennt es die Grenze seines Wissens?

Drei Prüfungen je Fall:
- inhaltlich: deckt sich die Antwort mit der erwarteten Antwort aus dem Katalog?
- fundstelle: wird die Pflichtquelle genannt (Governance-Regel aus prompts/de/rag_system.yaml)?
- unklar: bei Fällen ohne Gold-Fundstelle MUSS [Unklar] kommen statt einer erfundenen Zahl.

Das bewertende Modell (JUDGE_MODEL, Vorgabe llama-3-3-70b) ist absichtlich ein anderes als
das antwortende (LLM_MODEL, gpt-oss-120b): Ein Modell beurteilt die eigene Ausgabe milder.
Der Judge sieht die erwartete Antwort, muss also nicht selbst Recht können — er vergleicht nur.
"""
import argparse
import json
import os
import re

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap
from pathlib import Path

from retrieval import hybrid_search
from llm import chat
from config import BASE, JUDGE_MODEL, JUDGE_FALLBACKS

VALIDATION = os.path.join(BASE, "eval", "validation.jsonl")
HOLDOUT = os.path.join(BASE, "eval", "holdout.jsonl")
loader = PromptLoader(Path(BASE) / "prompts", lang="de")

JUDGE_SYS = """Du vergleichst die Antwort eines Assistenten mit einer hinterlegten Musterantwort
zu Förderrichtlinien nach § 44 LHO. Du musst das Recht nicht selbst kennen — die Musterantwort
ist maßgeblich.

Bewerte streng:
- inhaltlich_richtig: Sagt die Antwort dasselbe wie die Musterantwort? Abweichende Beträge,
  Fristen, Prozentsätze oder Rechtsgrundlagen bedeuten false. Zusätzliche richtige Angaben
  sind unschädlich, fehlende Kernaussagen nicht.
- fundstelle_genannt: Wird die erwartete Quelle benannt? Nur true, wenn das Dokument klar
  erkennbar ist; eine erfundene oder gar keine Fundstelle bedeutet false.
- erfundene_angaben: Enthält die Antwort Zahlen, Paragraphen oder Fristen, die weder in der
  Musterantwort noch erkennbar im Kontext stehen? Dann true.

Antworte AUSSCHLIESSLICH als JSON:
{"inhaltlich_richtig": bool, "fundstelle_genannt": bool, "erfundene_angaben": bool, "begruendung": "ein Satz"}"""

UNKLAR_SYS = """Du prüfst, ob ein Assistent die Grenze seines Wissens erkannt hat.

Die gestellte Frage ist aus dem vorliegenden Dokumentenbestand NICHT beantwortbar. Richtig
wäre daher, das kenntlich zu machen — etwa mit [Unklar] — statt eine plausible Zahl, Frist
oder Rechtsgrundlage zu erfinden.

Antworte AUSSCHLIESSLICH als JSON:
{"grenze_erkannt": bool, "hat_erfunden": bool, "begruendung": "ein Satz"}"""


def laden(pfad):
    with open(pfad, encoding="utf-8") as f:
        return [json.loads(z) for z in f if z.strip()]


def json_aus(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    try:
        return json.loads(m.group(0), strict=False) if m else {}
    except Exception:
        return {}


def fundstelle(p):
    seiten = p.get("seiten") or []
    s = f", S. {', '.join(map(str, seiten))}" if seiten else ""
    return f"{p.get('quelle')}{s} | {p.get('abschnitt')}"


def antworte(anfrage):
    """Derselbe Weg wie rag_query.py, damit gemessen wird, was das Werkzeug wirklich tut."""
    hits = hybrid_search(anfrage)
    seen, bloecke = set(), []
    for h in hits:
        pid = h.payload.get("parent_id")
        if pid in seen:
            continue
        seen.add(pid)
        bloecke.append(f"[{fundstelle(h.payload)}]\n{h.payload.get('parent_text') or h.payload.get('text')}")
    sicher = sanitize_and_wrap("\n\n".join(bloecke), tag_name="kontext", max_length=50000).wrapped_content
    prompt = loader.load("rag_system", kontext=sicher, frage=anfrage)
    # mit_modell: der Cluster weicht bei Ausfällen aus. Ohne Protokoll wäre am Ende unklar,
    # welches Modell welchen Anteil der Antworten erzeugt hat — die Zahlen wären nicht deutbar.
    return chat([{"role": "system", "content": prompt.system},
                 {"role": "user", "content": prompt.user}], mit_modell=True)


def _urteil(system, nutzer):
    """Judge-Aufruf mit eigener Ausweichkette; gibt Urteil und tatsächlich nutzendes Modell zurück."""
    text, modell = chat([{"role": "system", "content": system}, {"role": "user", "content": nutzer}],
                        model=JUDGE_MODEL, temperature=0, fallbacks=JUDGE_FALLBACKS, mit_modell=True)
    return json_aus(text), modell


def pruefe(fall, form):
    anfrage = fall["anfrage"].get(form) or fall["anfrage"].get("frage") or fall["anfrage"].get("situation")
    try:
        antwort, antwortmodell = antworte(anfrage)
        if not fall.get("gold"):  # Negativfall: erwartet wird [Unklar]
            u, modell = _urteil(UNKLAR_SYS, f"Frage: {anfrage}\n\nAntwort:\n{antwort}")
            return {"id": fall["id"], "typ": "negativ", "judge": modell, "modell": antwortmodell,
                    "ok": bool(u.get("grenze_erkannt")) and not u.get("hat_erfunden"),
                    "erfunden": bool(u.get("hat_erfunden")), "begruendung": u.get("begruendung", "")}

        quellen = ", ".join(g["quelle"] for g in fall["gold"] if g["pflicht"])
        u, modell = _urteil(JUDGE_SYS,
                            f"Frage: {anfrage}\n\nMusterantwort: {fall['erwartete_antwort']}\n"
                            f"Erwartete Quelle(n): {quellen}\n\nAntwort des Assistenten:\n{antwort}")
        return {"id": fall["id"], "typ": "positiv", "judge": modell, "modell": antwortmodell,
                "inhalt": bool(u.get("inhaltlich_richtig")), "fundstelle": bool(u.get("fundstelle_genannt")),
                "erfunden": bool(u.get("erfundene_angaben")), "begruendung": u.get("begruendung", "")}
    except Exception as e:
        return {"id": fall["id"], "fehler": f"{type(e).__name__}: {str(e)[:110]}"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--holdout", action="store_true")
    p.add_argument("--form", choices=["frage", "situation"], default="frage")
    p.add_argument("--limit", type=int, help="nur die ersten N Fälle (Rauchtest)")
    args = p.parse_args()

    faelle = laden(HOLDOUT if args.holdout else VALIDATION)
    if args.limit:
        faelle = faelle[:args.limit]
    print(f"{len(faelle)} Fälle | Antwort: siehe LLM_MODEL | Judge: {JUDGE_MODEL}")

    ergebnisse = [pruefe(f, args.form) for f in faelle]
    fehler = [e for e in ergebnisse if e.get("fehler")]
    pos = [e for e in ergebnisse if e.get("typ") == "positiv"]
    neg = [e for e in ergebnisse if e.get("typ") == "negativ"]

    def quote(rows, feld):
        return sum(1 for r in rows if r.get(feld)) / len(rows) if rows else 0.0

    if pos:
        print(f"\nBeantwortbare Fälle (n={len(pos)})")
        print(f"  inhaltlich richtig {quote(pos,'inhalt'):.0%} | Fundstelle genannt {quote(pos,'fundstelle'):.0%} "
              f"| erfundene Angaben {quote(pos,'erfunden'):.0%}")
    if neg:
        print(f"\nNicht beantwortbare Fälle (n={len(neg)}) — hier ist [Unklar] die richtige Antwort")
        print(f"  Grenze erkannt {quote(neg,'ok'):.0%} | trotzdem erfunden {quote(neg,'erfunden'):.0%}")
        for r in neg:
            print(f"    {'ok ' if r['ok'] else 'FEHL'} {r['id']}: {r['begruendung'][:90]}")
    if fehler:
        print(f"\n{len(fehler)} Fälle ohne Ergebnis (Endpunkt): {', '.join(e['id'] for e in fehler[:8])}")

    # Modellzusammensetzung protokollieren: bei Ausfällen weicht der Cluster aus, und ein
    # gemischter Lauf lässt sich nicht als Aussage über EIN Modell lesen.
    from collections import Counter
    for feld, name in (("modell", "geantwortet"), ("judge", "bewertet")):
        z = Counter(e[feld] for e in ergebnisse if e.get(feld))
        if z:
            print(f"  {name}: " + ", ".join(f"{m} {n}×" for m, n in z.most_common()))
    if len({e.get("modell") for e in ergebnisse if e.get("modell")}) > 1:
        print("  ACHTUNG: gemischte Modelle — die Quoten sind keine Aussage über ein einzelnes Modell.")


if __name__ == "__main__":
    main()
