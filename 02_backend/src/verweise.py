"""Verweise aus den Chunks ziehen und auflösbar machen (Baustein c).

Der Korpus trägt rund 10.600 Verweise auf 4.889 Chunks — gut zwei je Textstück, und etwa die
Hälfte davon nackt („In den Fällen der Nummer 7.8"). Eine Ähnlichkeitssuche findet solche Ziele
nicht, weil die Wörter nicht übereinstimmen; ein Verweis ist eine Adresse, keine Bedeutung.

Von Spark übernommen: `cross_ref_extraction.yaml` aus `rechtsquellenvorbereitung`. Der Prompt
passt auf unsere Dokumente, weil er auf Absätzen als Rohtext arbeitet und interne Verweise
ausdrücklich behandelt — im Gegensatz zur Verweiserkennung in `modul-rechtsmethodik`, die eine
fertige Normzerlegung voraussetzt.

Zwei Ergebnisse:
    payload["verweise"]  je Chunk die gefundenen Verweise mit Wortlaut, Typ und Ziel
    verweise.json        Nachschlagetabelle Adresse -> Chunk-IDs, und rückwärts gelesen:
                         wer zeigt auf diese Stelle?

Die Rückwärtsrichtung ist der eigentliche Gewinn. „Wer verweist auf Nummer 6 der ANBest-P?"
ist über Ähnlichkeit grundsätzlich nicht beantwortbar und über die Tabelle ein Nachschlagen.

Governance wie überall: versionierter Prompt mit Prüfsumme, Fremdtext gekapselt, und jeder
`wortlaut` wird gegen den Quelltext gehalten, bevor er übernommen wird — ein Verweis, dessen
Wortlaut nicht im Block steht, ist erfunden und fliegt raus.
"""
import json
import re
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

from adressierung import abkuerzungen
from llm import chat
from satzfilter import beleg_pruefen, kennung_finden
from config import BASE, SATZFILTER_TEMPERATUR

_loader = PromptLoader(Path(BASE) / "prompts", lang="de")

MAX_ZEICHEN = 12000   # je Stapel; der Prompt ist lang, die Blöcke sollen dagegen nicht verschwinden
MAX_BLOECKE = 6


def _stapel(bloecke):
    stapel, laufend, zeichen = [], [], 0
    for b in bloecke:
        gross = len(b["text"])
        if laufend and (zeichen + gross > MAX_ZEICHEN or len(laufend) >= MAX_BLOECKE):
            stapel.append(laufend)
            laufend, zeichen = [], 0
        laufend.append(b)
        zeichen += gross
    if laufend:
        stapel.append(laufend)
    return stapel


def _nummeriert(bloecke):
    return "\n".join(
        f"--- BLOCK {b['id']} ---\n{b['text']}\n" for b in bloecke
    )


def _abfragen(dokument, nummer, bloecke, zielnamen):
    roh = _nummeriert(bloecke)
    sicher = sanitize_and_wrap(roh, tag_name="bloecke",
                               max_length=MAX_ZEICHEN * 2 + 4000).wrapped_content
    prompt = _loader.load("verweise", dokument=dokument, nummer=nummer or "",
                          bloecke=sicher, zielnamen=", ".join(sorted(zielnamen)))
    out = chat([{"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user}],
               temperature=SATZFILTER_TEMPERATUR)

    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        return {}, prompt.meta
    try:
        antwort = json.loads(m.group(0)).get("bloecke") or []
    except Exception:
        return {}, prompt.meta

    bekannt = {b["id"]: b["text"] for b in bloecke}
    ergebnis = {}
    for eintrag in antwort:
        if not isinstance(eintrag, dict):
            continue
        kennung = kennung_finden(eintrag.get("id"), bekannt)
        if kennung is None:
            continue
        quelltext = {"text": bekannt[kennung], "parent_text": ""}
        treffer = []
        for t in (eintrag.get("treffer") or []):
            if not isinstance(t, dict):
                continue
            wortlaut = str(t.get("wortlaut") or "").strip()
            # Gegenprobe ohne Modellaufruf: steht der Wortlaut wirklich im Block?
            if not wortlaut or not beleg_pruefen(wortlaut, quelltext):
                continue
            ziel = str(t.get("ziel_dokument") or "").strip()
            treffer.append({
                "wortlaut": wortlaut,
                "typ": str(t.get("typ") or "").strip(),
                "ziel_dokument": zielnamen.get(ziel, "") if ziel else "",
                "ziel_stelle": str(t.get("ziel_stelle") or "").strip(),
                "intern": bool(t.get("intern")),
                "im_korpus": bool(ziel and ziel in zielnamen),
            })
        ergebnis[kennung] = treffer
    return ergebnis, prompt.meta


def finden(dokument, nummer, bloecke, zielnamen=None):
    """bloecke: [{"id", "text"}] aus EINEM Dokument. Ergibt {id: [Verweis, …]}."""
    zielnamen = abkuerzungen() if zielnamen is None else zielnamen
    alle, metas = {}, []
    for teil in _stapel(bloecke):
        treffer, meta = _abfragen(dokument, nummer, teil, zielnamen)
        alle.update(treffer)
        metas.append(meta)
    return alle, metas


def tabelle(punkte):
    """Nachschlagetabelle aus den geschriebenen Payloads.

    vorwaerts: „ANBest-G|8.1" -> [Chunk-IDs]        — wo steht diese Stelle?
    rueckwaerts: „ANBest-G|7.8" -> [Chunk-IDs]      — wer verweist auf diese Stelle?
    """
    vorwaerts, rueckwaerts = {}, {}
    for pt in punkte:
        pl = pt.payload
        dok, nr = pl.get("dokument"), pl.get("nummer")
        if dok and nr:
            vorwaerts.setdefault(f"{dok}|{nr}", []).append(str(pt.id))
        for v in (pl.get("verweise") or []):
            ziel_dok = v.get("ziel_dokument") or (dok if v.get("intern") else None)
            stelle = _stelle(v.get("ziel_stelle"))
            if ziel_dok and stelle:
                rueckwaerts.setdefault(f"{ziel_dok}|{stelle}", []).append(str(pt.id))
    return {"vorwaerts": vorwaerts, "rueckwaerts": rueckwaerts}


def _stelle(roh):
    """“Nummer 5.3.6” -> „5.3.6“, „Artikel 8“ -> „8“. Spannen bleiben unaufgelöst."""
    m = re.search(r"(?:Nummer|Nr\.|Artikel|Art\.|§+)\s*(\d+(?:\.\d+)*[a-z]?)", roh or "")
    return m.group(1) if m else None
