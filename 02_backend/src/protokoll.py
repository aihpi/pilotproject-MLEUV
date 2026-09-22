"""Mitschreiben, was ein Lauf tatsächlich getan hat.

Bis hierher gab es nur die Zugriffszeilen der beiden Dienste: welcher Pfad, welcher Status.
Was dabei herauskam — welcher Wert in welchem Feld landete, welche Befunde anschlugen, wie
lange das Modell brauchte —, stand allein in der Antwort und war danach weg.

Für die Fehlersuche ist das die falsche Hälfte. Die heutigen Befunde ließen sich nur finden,
weil jemand mitgelesen hat; was zwischen zwei Klicks passiert, war nicht rekonstruierbar. Eine
Zeile je Aufruf in JSONL schließt die Lücke und lässt sich mit `jq` auswerten.

NICHT für die Messung gedacht: dafür gibt es `eval.py` und `eval_feld.py` mit Gold-Ankern.
Dieses Protokoll beantwortet „was ist vorhin passiert", nicht „wie gut ist es".

Der Mitschnitt enthält die EINGABE der Bearbeiterin — ihre eigene Beschreibung der Förderidee,
kein Korpusinhalt. Er liegt unter `.data/` außerhalb von git und wandert nirgendwohin. Wer den
Dienst ohne Mitschnitt betreiben will, setzt `PROTOKOLL=` auf leer.

Ein Fehler beim Schreiben darf niemals den Aufruf scheitern lassen: ein Protokoll, das den
Betrieb anhält, ist schlimmer als keines.
"""
import json
import os
import time
from pathlib import Path

from config import BASE

# Leer heißt: nichts mitschreiben.
PFAD = os.getenv("PROTOKOLL", str(Path(BASE) / ".data" / "protokoll.jsonl"))

# Ab dieser Länge wird ein Text im Protokoll gekürzt. Eine Förderidee ist ein Absatz, ein
# Richtlinienabschnitt mehrere — vollständig gespeichert wäre die Datei nach einem Tag
# unhandlich, und für die Fehlersuche genügt der Anfang.
MAX_TEXT = 600


def _kurz(wert):
    if isinstance(wert, str) and len(wert) > MAX_TEXT:
        return wert[:MAX_TEXT] + f" […{len(wert) - MAX_TEXT} Zeichen]"
    if isinstance(wert, list):
        return [_kurz(w) for w in wert]
    return wert


def schreibe(art, **felder):
    """Eine Zeile ins Protokoll. Schlägt der Schreibvorgang fehl, passiert nichts weiter."""
    if not PFAD:
        return
    eintrag = {"zeit": time.strftime("%Y-%m-%dT%H:%M:%S"), "art": art,
               **{k: _kurz(v) for k, v in felder.items()}}
    try:
        Path(PFAD).parent.mkdir(parents=True, exist_ok=True)
        with open(PFAD, "a", encoding="utf-8") as f:
            f.write(json.dumps(eintrag, ensure_ascii=False) + "\n")
    except OSError:
        pass
