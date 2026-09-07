"""Satzfilter: aus den abgerufenen Kontextblöcken die tragenden Sätze auswählen.

Von Spark übernommen (`modul-suche-und-zuordnung`, Stufe 2): Satztrennung mit Schutz der
deutschen Abkürzungen, Nummerierung der Sätze im Prompt, Auswahl über Satz-INDIZES statt über
Text, Stapelung nach Größe, Zusammensetzen mit `(...)` an den Lücken.

Zwei bewusste Abweichungen:

1. **Die Indizes bleiben erhalten.** Spark wirft sie weg: `reconstruct_from_indices` fügt die
   gewählten Sätze zu einem String zusammen, und gespeichert wird nur dieser Text samt Titel,
   Seitenzahlen und Chunk-Kennungen (`map_fundstellen` im agent_orchestration_service). Die
   Fundstelle bleibt dort knotengenau; ein Zeiger „Satz 3 in Abschnitt 4.1.8" überlebt nicht.
   Hier bleibt er erhalten, und daraus wird eine Belegstelle, die sich per Zeichenvergleich
   gegen die Quelle halten lässt — ohne Modellaufruf (`beleg_pruefen`).

2. **Anliegen statt Tatbestandsmerkmal.** Sparks Prompt verlangt ein zerlegtes Tatbestandsmerkmal
   samt juristischer Analyse. Das setzt `tatbestandsmerkmalsextraction` voraus, das im Piloten
   noch nicht gebaut ist. An seiner Stelle steht das Anliegen: Abschnittsthema und Entwurfstext.

Nicht übernommen: Sparks Stufe 1 wählt Abschnitte über einen PageIndex-Baum mit Zusammenfassungen
je Knoten (`prepare_stage1` liest `node.summary`). Der Baum kommt aus `modul-inhaltsextraktion`
und ist nicht übernommen. Diese Rolle füllen hier das Hybrid-Retrieval und der Mehrheitsentscheid
in retrieval.py.
"""
import json
import re
import unicodedata

from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

from llm import chat
from config import (BASE, SATZFILTER_TEMPERATUR, SATZFILTER_MAX_ZEICHEN,
                    SATZFILTER_MAX_BLOECKE)

_loader = PromptLoader(Path(BASE) / "prompts", lang="de")

# Abkürzungen, deren Punkt kein Satzende ist. Aus Spark übernommen und um die Formen ergänzt,
# die im Zuwendungsrecht tragend sind (Abs., Nr., Buchst., i. V. m., i. H. v. …).
# Gliederungsnummern brauchen keinen Schutz: getrennt wird nur bei Punkt + Leerraum +
# Großbuchstabe, und „4.1.8" hat hinter dem Punkt keinen Leerraum.
_ABKUERZUNGEN = (
    r"z\.\s*B\.", r"u\.\s*a\.", r"u\.\s*U\.", r"d\.\s*h\.", r"i\.\s*d\.\s*R\.",
    r"i\.\s*S\.\s*d\.", r"i\.\s*S\.\s*v\.", r"i\.\s*V\.\s*m\.", r"i\.\s*H\.\s*v\.",
    r"i\.\s*d\.\s*F\.", r"v\.\s*H\.", r"etc\.", r"bzw\.", r"ca\.", r"ggf\.", r"inkl\.",
    r"einschl\.", r"insb\.", r"max\.", r"min\.", r"usw\.", r"vgl\.", r"gem\.", r"sog\.",
    r"evtl\.", r"Nr\.", r"Nrn\.", r"Abs\.", r"Art\.", r"Buchst\.", r"lit\.", r"Ziff\.",
    r"Tz\.", r"Mio\.", r"Mrd\.", r"Abschn\.", r"Anl\.", r"Tab\.", r"S\.(?=\s*\d)",
)
_MUSTER = re.compile("|".join(_ABKUERZUNGEN), re.IGNORECASE)
_MARKE = re.compile("\x00(\\d+)\x00")


def _schuetzen(text):
    """Abkürzungen gegen Platzhalter tauschen. Anders als Spark wird der Wortlaut nicht aus dem
    Muster zurückgebaut, sondern wörtlich aufbewahrt — der Satz muss zeichengleich zur Quelle
    bleiben, sonst schlägt die Belegprüfung genau an den geschützten Stellen fehl."""
    aufbewahrt = []

    def _tauschen(m):
        aufbewahrt.append(m.group(0))
        return f"\x00{len(aufbewahrt) - 1}\x00"

    return _MUSTER.sub(_tauschen, text), aufbewahrt


def saetze_teilen(text):
    """Text in Sätze trennen. Getrennt wird bei .!? vor einem Großbuchstaben und an Leerzeilen."""
    if not text:
        return []
    geschuetzt, aufbewahrt = _schuetzen(text)
    rohe = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ§])|(?:\n\s*\n)+", geschuetzt)
    saetze = []
    for roh in rohe:
        satz = _MARKE.sub(lambda m: aufbewahrt[int(m.group(1))], roh).strip()
        if satz:
            saetze.append(satz)
    return saetze


def zusammensetzen(saetze, indizes):
    """Gewählte Sätze zu einem Text fügen, Lücken mit `(...)` kennzeichnen (Spark 1:1)."""
    if not saetze:
        return ""
    gueltig = sorted(i for i in set(indizes) if 0 <= i < len(saetze))
    if not gueltig:
        return "(...)"
    teile = ["(...)"] if gueltig[0] > 0 else []
    vorher = None
    for i in gueltig:
        if vorher is not None and i > vorher + 1:
            teile.append("(...)")
        teile.append(saetze[i])
        vorher = i
    if gueltig[-1] < len(saetze) - 1:
        teile.append("(...)")
    return " ".join(teile)


def _stapel(bloecke):
    """Blöcke nach Größe bündeln (Spark: STAGE2_MAX_BATCH_TOKENS und MAX_CHUNKS_PER_BATCH).

    Gezählt wird in Zeichen, nicht in Token: der Pilot spricht über LiteLLM mit wechselnden
    Modellen, ein modellfremder Token-Zähler wäre eine Scheingenauigkeit. Ein Block, der allein
    das Maß überschreitet, bekommt einen eigenen Stapel statt gekürzt zu werden.
    """
    stapel, laufend, zeichen = [], [], 0
    for block in bloecke:
        gross = len(block["roh"])
        if laufend and (zeichen + gross > SATZFILTER_MAX_ZEICHEN
                        or len(laufend) >= SATZFILTER_MAX_BLOECKE):
            stapel.append(laufend)
            laufend, zeichen = [], 0
        laufend.append(block)
        zeichen += gross
    if laufend:
        stapel.append(laufend)
    return stapel


def _nummeriert(bloecke):
    return "\n".join(
        f"--- BLOCK {b['id']} ---\n"
        f"Fundstelle: {b['fundstelle']}\n"
        f"Anzahl Sätze: {len(b['saetze'])}\n\n"
        + "\n".join(f"[{i}] {s}" for i, s in enumerate(b["saetze"])) + "\n"
        for b in bloecke
    )


def _abfragen(anliegen, bloecke):
    """Ein Stapel an das Modell. Ergebnis: {Blockkennung: (Indizes, Begründung)}."""
    roh = _nummeriert(bloecke)
    # `sanitize_and_wrap` KÜRZT NICHT, sondern wirft bei Überlänge. Das Maß deshalb aus der
    # Stapelgrenze ableiten und nicht fest setzen: die Nummerierung und die Blockköpfe kommen
    # zum Rohtext hinzu, und die Stapelgrenze ist über die Umgebung verstellbar.
    grenze = SATZFILTER_MAX_ZEICHEN * 2 + 4000
    sicher = sanitize_and_wrap(roh, tag_name="bloecke", max_length=grenze).wrapped_content
    prompt = _loader.load("satzfilter", anliegen=anliegen, bloecke=sicher)
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

    ergebnis = {}
    bekannt = {b["id"]: len(b["saetze"]) for b in bloecke}
    for eintrag in antwort:
        if not isinstance(eintrag, dict):
            continue
        kennung = kennung_finden(eintrag.get("id"), bekannt)
        if kennung is None:   # erfundene Blockkennung: verwerfen, nicht raten
            continue
        indizes = [i for i in (eintrag.get("saetze") or [])
                   if isinstance(i, int) and 0 <= i < bekannt[kennung]]
        ergebnis[kennung] = (indizes, str(eintrag.get("begruendung") or ""))
    return ergebnis, prompt.meta


def filtern(anliegen, bloecke):
    """bloecke: [{"id", "fundstelle", "roh", "punkt"}] — „roh" ist der ungefilterte Blocktext.

    Ergebnis je Block: Sätze, gewählte Indizes, gekürzter Text und Begründung. Blöcke, zu denen
    das Modell nichts liefert, behalten ihren vollen Text — ein ausgefallener Filterlauf darf
    Kontext nicht stillschweigend verschlucken.
    """
    for b in bloecke:
        b["saetze"] = saetze_teilen(b["roh"])

    ausgewaehlt, metas = {}, []
    for teil in _stapel(bloecke):
        treffer, meta = _abfragen(anliegen, teil)
        ausgewaehlt.update(treffer)
        metas.append(meta)

    ergebnis = []
    for b in bloecke:
        indizes, begruendung = ausgewaehlt.get(b["id"], (None, ""))
        gefiltert = indizes is not None
        ergebnis.append({
            **b,
            "indizes": indizes if gefiltert else list(range(len(b["saetze"]))),
            "kurz": zusammensetzen(b["saetze"], indizes) if gefiltert else b["roh"],
            "begruendung": begruendung,
            "gefiltert": gefiltert,
        })
    return ergebnis, metas


def kennung_finden(roh, bekannt):
    """Blockkennung aus der Modellantwort auf eine bekannte Kennung abbilden, oder None.

    Nötig, weil die Blöcke im Prompt als „--- BLOCK 0 ---" überschrieben sind und Modelle die
    ganze Beschriftung zurückgeben („BLOCK 0" statt „0"). Ein strenger Vergleich verwirft dann
    den gesamten Block, und zwar lautlos: in der Verweisextraktion sind so 10 von 12 Treffern
    verlorengegangen, ohne dass ein Fehler entstand.

    Erfundene Kennungen werden weiterhin verworfen — es wird nur toleranter verglichen, nicht
    geraten: die Kennung muss als eigenes Wort in der Antwort stehen.
    """
    s = str(roh or "").strip()
    if s in bekannt:
        return s
    for teil in reversed(re.split(r"[\s:#|/\\]+", s)):
        if teil in bekannt:
            return teil
    return None


def belege(eintrag):
    """Belegstellen eines Eintrags: (Satznummer, Wortlaut). Das ist der Teil, den Spark verwirft."""
    return [(i, eintrag["saetze"][i]) for i in eintrag["indizes"] if i < len(eintrag["saetze"])]


def _norm(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "")).strip()


def beleg_pruefen(zitat, payload):
    """Steht das Zitat wörtlich in der Quelle? Zeichenvergleich, kein Modellaufruf.

    Dieselbe Normalisierung wie in eval.py: Unicode-Form und Leerraum vereinheitlicht, sonst
    scheitert der Vergleich an Zeilenumbrüchen und Trennstrichen aus der PDF-Extraktion.
    """
    volltext = _norm(payload.get("text")) + " " + _norm(payload.get("parent_text"))
    return _norm(zitat) in volltext
