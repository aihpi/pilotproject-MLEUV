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
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import vorschlag
from config import TOP_K

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
    top_k: int = Field(default=TOP_K, ge=1, le=20)


class Vorschlag(BaseModel):
    feld: str
    label: str
    wert: str | None
    status: Literal["suggested", "unklar", "invalid"] | None
    quelle: str | None
    musterbaustein: str | None = None
    fundstelle: str | None = None
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
            top_k=anfrage.top_k, konsens=anfrage.konsens)
    except Exception as e:
        # Endpunkt weg oder Zeitlimit: 502, nicht 500 — der Fehler liegt stromaufwärts,
        # und die Node-Seite soll ihn als solchen behandeln können.
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}") from e

    if nachweis.get("fehler"):
        raise HTTPException(status_code=502, detail=nachweis["fehler"])
    return {"vorschlaege": vorschlaege, "nachweis": nachweis}
