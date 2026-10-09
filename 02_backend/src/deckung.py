"""Trägt die angegebene Stelle den behaupteten Wert?

Ein deterministischer Wortvergleich beantwortet das nicht. Gemessen an den drei Fehlern des
Durchlaufs vom 08.10.2026: Beim Förderziel stimmten 62 Prozent der Wörter überein, bei einer
ECHTEN Deckung 75 Prozent — eine Schwelle dazwischen wäre auf einem einzigen Beispiel
geeicht. Und beim Empfängerkreis war die Deckung inhaltlich richtig („Gefördert wird … durch
Tierärztinnen und Tierärzte"), nur der Schluss daraus falsch: Leistungserbringer statt
Empfänger. Kein Wortvergleich sieht das.

Das bewertende Modell ist ein anderes als das vorschlagende — ein Modell beurteilt die
eigene Ausgabe milder. Es muss kein Recht können; es vergleicht zwei Texte, die beide vor
ihm liegen.

Hier und nicht in `eval_deckung.py`, weil beide dasselbe Urteil brauchen: die Messung, um die
Deckungen eines Laufs auszuzählen, und der Vorschlagsweg, um ein falsches Etikett zu
verhindern. Zwei Fassungen desselben Urteils würden auseinanderlaufen, ohne dass es auffällt.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

from judge_antwort import json_aus
from llm import chat
from config import BASE, JUDGE_MODEL, JUDGE_FALLBACKS

loader = PromptLoader(Path(BASE) / "prompts", lang="de")

# Urteile, die das Etikett „durch Ihre Angabe gedeckt" nicht mehr tragen.
#
# „teilweise" zählt dazu: Die Stelle gehört zur Sache, entscheidet sie aber nicht — und genau
# das war der Fehler, den die Bearbeiterin nicht sehen konnte. Ein zu vorsichtiges „bitte
# prüfen" kostet einen Blick, ein falsches „gedeckt" kostet die Prüfung ganz.
NICHT_GEDECKT = {"teilweise", "traegt_nicht"}


def beurteilen(feld, wert, stelle):
    """Ein Urteil über eine einzelne Stelle. Ergibt (urteil, begruendung, modell)."""
    prompt = loader.load(
        "deckung_pruefen",
        feld=feld,
        wert=str(wert),
        # Fremdtext im Prompt, wie überall: die Stelle stammt aus einem Dokument oder aus
        # der Eingabe der Bearbeiterin, nicht von uns.
        stelle=sanitize_and_wrap(str(stelle), tag_name="stelle",
                                 max_length=8000).wrapped_content,
    )
    text, modell = chat(
        [{"role": "system", "content": prompt.system},
         {"role": "user", "content": prompt.user}],
        model=JUDGE_MODEL, temperature=0, fallbacks=JUDGE_FALLBACKS, mit_modell=True)
    daten = json_aus(text) or {}
    return daten.get("urteil"), daten.get("begruendung", ""), modell


def mehrere_beurteilen(faelle, max_parallel=6):
    """Mehrere Deckungen auf einmal. `faelle`: [(feld, wert, stelle)].

    Nebenläufig, weil die Aufrufe voneinander unabhängig sind: Ein Abschnitt hat selten mehr
    als drei Felder mit Deckung, und seriell wären das drei Wartezeiten statt einer.

    Ein Ausfall des Urteils ist KEIN Urteil: Die Liste trägt dann None, und der Aufrufer lässt
    das Etikett, wie es war. Ein nicht erreichbares Modell darf keine Deckung entwerten.
    """
    if not faelle:
        return []

    def eins(f):
        try:
            return beurteilen(*f)
        except Exception as e:
            return None, f"Urteil nicht erreichbar: {type(e).__name__}", None

    with ThreadPoolExecutor(max_workers=min(len(faelle), max_parallel)) as pool:
        return list(pool.map(eins, faelle))
