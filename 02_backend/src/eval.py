"""Retrieval-Eval gegen den Fragenkatalog in eval/.

Gemessen wird deterministisch gegen die Gold-Anker — ohne LLM. Ein Treffer zählt,
wenn eine abgerufene Passage das wörtliche Ankerzitat enthält (chunking-invariant)
oder ersatzweise aus derselben Quelle mit überlappender Seitenzahl stammt.

Metriken je Fall:
- vollstaendig: ALLE Pflicht-Fundstellen gefunden. Das ist die eigentliche Zielgröße —
  eine Richtlinie ist auch dann falsch, wenn nur eine von zwei einschlägigen Normen zitiert wird.
- recall: Anteil der gefundenen Pflicht-Fundstellen.
- mrr: Kehrwert des Rangs der ersten Pflicht-Fundstelle (wie weit oben steht sie).
- precision: Anteil der abgerufenen Passagen, die zum Gold gehören (Rauschmaß).

Aufrufe:
    python eval.py                      # Validierungsteil, Standardkonfiguration
    python eval.py --holdout            # Rückhalte-Teil (nur für die Abschlussmessung!)
    python eval.py --vergleich          # mehrere Konfigurationen gegeneinander
    python eval.py --form situation     # Anfrageform: frage (Vorgabe) | situation

Der Judge steckt in judge_antwort.py und bewertet nur die Antwortqualität; das Retrieval
braucht ihn nicht mehr.
"""
import argparse
import json
import os
import re
import statistics
import unicodedata
from collections import defaultdict

from ingest import saeubern
from retrieval import hybrid_search
from config import BASE, TOP_K

VALIDATION = os.path.join(BASE, "eval", "validation.jsonl")
HOLDOUT = os.path.join(BASE, "eval", "holdout.jsonl")


def norm(s):
    """Vergleichsform für Ankerzitat und Chunk-Text.

    Mit `saeubern` aus dem Einlesen, und das ist nicht optional: Seit die weichen
    Trennstriche aus dem Index genommen sind, steht dort „querschnittsorientierte", im
    Ankerzitat aber weiter „querschnittsorien\xad tierte". 16 der 118 Anker tragen so ein
    Zeichen. Ohne dieselbe Reinigung auf beiden Seiten vergleicht die Messung zwei
    verschiedene Texte und meldet einen Fehlschlag, wo die Stelle gefunden wurde.
    """
    return re.sub(r"\s+", " ", saeubern(unicodedata.normalize("NFC", s or ""))).strip()


def laden(pfad):
    with open(pfad, encoding="utf-8") as f:
        return [json.loads(z) for z in f if z.strip()]


def trifft(fundstelle, treffer):
    """Deckt die abgerufene Passage die Gold-Fundstelle ab?

    Erst über das wörtliche Ankerzitat (überlebt jede Änderung am Chunking),
    ersatzweise über Quelle + Seitenüberlappung, falls die Chunk-Grenze das Zitat zerschneidet.
    """
    p = treffer.payload
    if p.get("quelle") != fundstelle["quelle"]:
        return False
    anker = norm(fundstelle.get("ankerzitat"))
    if anker:
        volltext = norm(p.get("text")) + " " + norm(p.get("parent_text"))
        if anker in volltext:
            return True
    gold_seiten, treffer_seiten = fundstelle.get("seiten"), p.get("seiten")
    return bool(gold_seiten and treffer_seiten and set(gold_seiten) & set(treffer_seiten))


def bewerte(fall, treffer):
    pflicht = [f for f in (fall.get("gold") or []) if f["pflicht"]]
    erlaubt = fall.get("gold") or []  # Pflicht + Alternativen + ergänzende: alles kein Rauschen
    if not pflicht:
        return None

    gefunden, erster_rang = 0, None
    for f in pflicht:
        for rang, t in enumerate(treffer, 1):
            if trifft(f, t):
                gefunden += 1
                erster_rang = rang if erster_rang is None else min(erster_rang, rang)
                break
    relevant = sum(1 for t in treffer if any(trifft(f, t) for f in erlaubt))
    return {
        "vollstaendig": gefunden == len(pflicht),
        "recall": gefunden / len(pflicht),
        "mrr": 1 / erster_rang if erster_rang else 0.0,
        "precision": relevant / max(len(treffer), 1),
        "pflicht": len(pflicht),
    }


def lauf(faelle, form="frage", **such_args):
    """form: frage | situation | konstruiert.

    „konstruiert" nimmt denselben Situationstext wie „situation", schickt ihn aber durch die
    Anfrage-Konstruktion (B2) statt unverändert in die Suche — das ist der Vergleich, der zeigt,
    ob das Zwischenstück den Abstand zwischen beiden Formen schließt.
    """
    ergebnisse = []
    for fall in faelle:
        quelle = "situation" if form == "konstruiert" else form
        anfrage = fall["anfrage"].get(quelle) or fall["anfrage"].get("situation") or fall["anfrage"].get("frage")
        if form == "konstruiert":
            from anfrage import suche
            treffer = suche(anfrage, abschnitt_nr=fall.get("abschnitt_nr"), **such_args)
        else:
            treffer = hybrid_search(anfrage, **such_args)
        w = bewerte(fall, treffer)
        if w:
            w.update(id=fall["id"], stufe=fall["stufe"], abschnitt=fall.get("abschnitt_nr"))
            ergebnisse.append(w)
    return ergebnisse


def mittel(werte, feld):
    zahlen = [w[feld] for w in werte]
    return sum(zahlen) / len(zahlen) if zahlen else 0.0


def bericht(ergebnisse, titel):
    n = len(ergebnisse)
    print(f"\n{titel}  (n={n})")
    print(f"  vollständig {mittel(ergebnisse,'vollstaendig'):.0%} | recall {mittel(ergebnisse,'recall'):.0%} "
          f"| MRR {mittel(ergebnisse,'mrr'):.2f} | precision {mittel(ergebnisse,'precision'):.0%}")

    for feld, name in (("stufe", "Stufe"), ("abschnitt", "Abschnitt")):
        gruppen = defaultdict(list)
        for w in ergebnisse:
            gruppen[w[feld]].append(w)
        teile = [f"{name} {k}: {mittel(v,'vollstaendig'):.0%} (n={len(v)})"
                 for k, v in sorted(gruppen.items(), key=lambda kv: (kv[0] is None, kv[0]))]
        print("  " + " | ".join(teile))

    misslungen = [w["id"] for w in ergebnisse if not w["vollstaendig"]]
    if misslungen:
        print(f"  nicht vollständig ({len(misslungen)}): {', '.join(misslungen[:22])}"
              + (" …" if len(misslungen) > 22 else ""))
    return ergebnisse


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--holdout", action="store_true", help="Rückhalte-Teil messen (nur zum Schluss)")
    p.add_argument("--form", choices=["frage", "situation", "konstruiert"], default="frage")
    p.add_argument("--vergleich", action="store_true", help="Konfigurationen gegeneinander")
    p.add_argument("--rerank", choices=["rang", "konsens", "aus"], default="rang",
                   help="Nachbehandlung der Kandidaten: ein Lauf mit Rangfolge (Vorgabe), "
                        "Mehrheitsentscheid über die Auswahl, oder aus")
    p.add_argument("--top-k", type=int, default=TOP_K)
    args = p.parse_args()

    pfad = HOLDOUT if args.holdout else VALIDATION
    faelle = laden(pfad)
    beantwortbar = [f for f in faelle if f.get("gold")]
    negativ = len(faelle) - len(beantwortbar)
    print(f"{os.path.basename(pfad)}: {len(faelle)} Fälle, davon {len(beantwortbar)} mit Gold-Fundstelle "
          f"und {negativ} ohne (die prüft judge_antwort.py auf die [Unklar]-Regel).")

    if not args.vergleich:
        rerank = False if args.rerank == "aus" else args.rerank
        # Beim Mehrheitsentscheid kann das Ergebnis kleiner als top_k sein — das drückt den
        # Recall und hebt die Precision. Genau dieser Tausch ist die zu messende Größe.
        bericht(lauf(beantwortbar, form=args.form, top_k=args.top_k, rerank=rerank),
                f"Hybrid, Nachbehandlung „{args.rerank}“, Anfrageform „{args.form}“")
        return

    # Jede Zeile ändert genau EINEN Faktor gegenüber der Grundeinstellung (Hybrid, Filter an, Form Frage).
    konfigs = [
        ("nur dense",                    dict(modus="dense"),          "frage"),
        ("nur BM25",                     dict(modus="bm25"),           "frage"),
        ("Hybrid (Grundeinstellung)",    dict(),                       "frage"),
        ("Hybrid, Gültigkeitsfilter aus", dict(nur_aktuell=False),     "frage"),
        ("Hybrid, Anfrageform Situation", dict(),                      "situation"),
        ("Hybrid, Situation KONSTRUIERT (B2)", dict(),               "konstruiert"),
    ]
    for titel, kwargs, form in konfigs:
        bericht(lauf(beantwortbar, form=form, rerank=False, top_k=args.top_k, **kwargs), titel)
    print("\nAlle Zeilen ohne LLM-Reranking gerechnet — deterministisch und ohne Cluster-Abhängigkeit.")


if __name__ == "__main__":
    main()
