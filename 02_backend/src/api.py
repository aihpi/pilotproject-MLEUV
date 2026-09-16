"""HTTP-Naht zum Frontend: ein Dienst, der Feldvorschläge liefert.

Arbeitsteilung, abgeleitet aus dem Prozessmodell: Arvids Node-API bleibt die Schnittstelle
nach außen — sie kennt den Entwurf, die Chat-Stufe und die Felddefinitionen. Dieser Dienst
kennt den Korpus, die Musterbausteine und das Modell. Er bekommt gesagt, welche Felder zu
füllen sind, und liefert Vorschläge mit Beleg zurück.

Deshalb gibt er auch NICHT das `ChatReply`-Format des Frontends zurück: Folgefrage, Fortschritt
und Entwurfszustand kennt die Node-Seite, nicht wir. Sie setzt daraus die Antwort zusammen.

    uvicorn api:app --port 8000 --app-dir src

Eine Warnung zur Laufzeit: ein Vorschlag dauert hier eine bis zwei Minuten — Hybrid-Suche,
Satzfilter und Vorschlag sind drei Modellrunden hintereinander. Für einen Chat ist das zu
langsam; für den Durchstich reicht es. Wer das später beschleunigen will, fängt beim
Satzfilter an, der über mehrere Stapel geht.
"""
import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import vorschlag
from adressierung import register
from config import TOP_K, CORPUS_DIR

app = FastAPI(title="MLEUV Feldvorschläge", version="0.1.0")


class Option(BaseModel):
    value: str
    label: str | None = None


class FeldDefinition(BaseModel):
    """Wie in packages/shared. Kommt vom Aufrufer — siehe Modulkopf, bewusst keine Kopie hier."""
    id: str
    label: str | None = None
    kind: str | None = None
    options: list[Option] | None = None
    help: str | None = None


class Anfrage(BaseModel):
    abschnitt_nr: int = Field(ge=0, le=10, description="Baustein 1-8; 0, 9, 10 sind formal")
    eingabe: str = Field(min_length=1)
    felder: list[FeldDefinition] = Field(min_length=1)
    konsens: bool = Field(
        default=False,
        description="Mehrfach holen und abstimmen. Dreifache Kosten. Nützlich weniger zur "
                    "Stabilisierung als zur ehrlichen Konfidenz: Uneinigkeit der Läufe ist "
                    "aussagekräftiger als die Selbstauskunft des Modells.")
    abfrageart: Literal["vorschlagen"] | None = Field(
        default=None,
        description="Sorte der Abfrage nach dem Prozessmodell. „vorschlagen“ schränkt den "
                    "Korpus auf frühere Richtlinien und Rahmenpläne ein — das Modell "
                    "schreibt das für die KI-Vorschläge zu Voraussetzungen, fachlichen "
                    "Ausschlüssen und Zuwendungsbestimmungen dreimal wörtlich vor. Ohne "
                    "Angabe wird der ganze Korpus gesehen.")
    top_k: int = Field(default=TOP_K, ge=1, le=20)


class Vorschlag(BaseModel):
    feld: str
    label: str
    wert: str | None
    status: Literal["suggested", "unklar", "invalid"] | None
    quelle: str | None
    musterbaustein: str | None = None
    fundstelle: str | None = None
    belegdatei: str | None = None
    belegseite: int | None = None
    belegzitat: str | None = None
    belegquelle: str | None = None
    beleg_geprueft: bool | None = None
    deckung: str | None = None
    begruendung: str | None = None
    konfidenz: float | None = None


class Nachweis(BaseModel):
    """Was der Prüfvermerk und die Fehlersuche brauchen — nicht die Oberfläche.

    Alles, was hier nicht steht, filtert FastAPI aus der Antwort — stillschweigend. Wer ein
    Feld im Nachweis ergänzt, muss es auch hier eintragen, sonst kommt es nie an.
    """
    modelle: list[str] = []
    dauer_s: dict[str, float] = {}
    abfrageart: str | None = None
    fundstellen: list[str] = []
    musterbausteine: list[str] = []
    prompts: list[str] = []
    befunde: list[str] = []


class Antwort(BaseModel):
    vorschlaege: list[Vorschlag]
    nachweis: Nachweis


@app.get("/gesundheit")
def gesundheit():
    """Erreichbarkeit plus die Frage, ob die Musterbausteine vorliegen.

    Ohne sie läuft der Dienst, liefert aber Vorschläge ohne Satzrahmen — schlechter, ohne
    dass es auffällt. Die Datei ist von git ausgenommen, fehlt also in jedem frischen Klon.
    """
    bausteine = {n: len(vorschlag.rahmen(n)) for n in range(1, 9)}
    return {"ok": True,
            "musterbausteine": bausteine,
            "vorlage_eingelesen": any(bausteine.values())}


@app.get("/dokument/{datei}")
def dokument(datei: str):
    """Quelldokument ausliefern, damit eine Fundstelle anklickbar wird.

    Die Oberfläche hängt `#page=N` an und der Betrachter springt an die Stelle. Ohne das
    bliebe die Fundstelle eine Behauptung — nachprüfbar nur, wer den Datenordner kennt.

    Zwei Schranken, obwohl der Dienst lokal läuft:

    1. Nur was im Dokumentregister steht. Das Register ist die Liste der Dokumente, über
       die dieses Werkzeug überhaupt Auskunft gibt; alles andere im Datenordner geht
       niemanden etwas an, der hier anfragt.
    2. Der aufgelöste Pfad muss unter CORPUS_DIR liegen. Ein Dateiname wie `../../.env`
       stünde zwar nicht im Register, aber die zweite Schranke kostet nichts und hält auch
       dann, wenn jemand das Register später aus einer anderen Quelle füllt.

    Die Dateien stammen teils aus den vertraulichen Ordnern. Solange der Dienst an
    127.0.0.1 hängt, ist das die Festplatte der Bearbeiterin. Vor jedem Betrieb über das
    Netz braucht dieser Endpunkt eine Berechtigungsprüfung — und zwar als erster.
    """
    reg = register()
    if datei not in reg:
        raise HTTPException(status_code=404, detail="Nicht im Dokumentregister.")

    wurzel = os.path.realpath(CORPUS_DIR)
    treffer = [os.path.join(w, f)
               for w, _, fs in os.walk(wurzel) for f in fs if f == datei]
    if not treffer:
        raise HTTPException(status_code=404, detail="Datei im Datenordner nicht gefunden.")

    pfad = os.path.realpath(treffer[0])
    if not pfad.startswith(wurzel + os.sep):
        raise HTTPException(status_code=403, detail="Pfad außerhalb des Datenordners.")

    art = "application/pdf" if pfad.lower().endswith(".pdf") else "application/octet-stream"
    # inline, nicht als Download: der Zweck ist das Aufschlagen an der richtigen Seite.
    return FileResponse(pfad, media_type=art,
                        headers={"Content-Disposition": f'inline; filename="{datei}"'})


@app.post("/vorschlag", response_model=Antwort)
def vorschlag_erzeugen(anfrage: Anfrage):
    felder = [f.model_dump(exclude_none=True) for f in anfrage.felder]
    for f in felder:
        if f.get("options"):
            f["options"] = [{"value": o["value"], "label": o.get("label") or o["value"]}
                            for o in f["options"]]
    try:
        vorschlaege, nachweis = vorschlag.vorschlagen(
            anfrage.abschnitt_nr, anfrage.eingabe.strip(), felder,
            top_k=anfrage.top_k, konsens=anfrage.konsens,
            abfrageart=anfrage.abfrageart)
    except Exception as e:
        # Endpunkt weg oder Zeitlimit: 502, nicht 500 — der Fehler liegt stromaufwärts,
        # und die Node-Seite soll ihn als solchen behandeln können.
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}") from e

    if nachweis.get("fehler"):
        raise HTTPException(status_code=502, detail=nachweis["fehler"])
    return {"vorschlaege": vorschlaege, "nachweis": nachweis}
