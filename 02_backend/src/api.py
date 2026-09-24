"""HTTP-Naht zum Frontend: ein Dienst, der Feldvorschläge liefert.

Arbeitsteilung, abgeleitet aus dem Prozessmodell: die Node-API bleibt die Schnittstelle
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
import tempfile
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import pruefmodus
import richtlinie
import begruendung
import protokoll
import vorschlag
from adressierung import register
from config import TOP_K, CORPUS_DIR, HOLDOUT_DATEIEN

app = FastAPI(title="MLEUV Feldvorschläge", version="0.1.0")

# Obergrenze für einen hochgeladenen Entwurf. Die Richtlinien im Korpus liegen
# zwischen 140 KB und 4 MB; 20 MB lassen Luft für Scans und begrenzen trotzdem,
# was ein Fehlgriff an Arbeitsspeicher kostet.
PRUEFUNG_MAX_BYTES = 20 * 1024 * 1024


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
    regelfall: bool = Field(
        default=False,
        description="Darf ein Feld, das die Eingabe nicht deckt, aus dem REGELFALL der "
                    "Musterbausteine abgeleitet werden? Im Gespräch nein — dort ist "
                    "Schweigen eine Auskunft. Beim Knopf „Vorschlag holen\" im Formular ja: "
                    "dort ist der Regelfall das Gewünschte, ausgewiesen als nicht gedeckt.")
    entschieden: list[dict] | None = Field(
        default=None,
        description="Schon bestätigte Werte desselben Abschnitts als [{label, wert}]. "
                    "Vorgabe, nicht Vorschlag: an ihnen richtet sich das Modell aus, statt "
                    "jedes Feld für sich zu raten.")
    nachbarfelder: list[FeldDefinition] | None = Field(
        default=None,
        description="Die übrigen Felder desselben Abschnitts, die in einer ANDEREN Anfrage "
                    "gefüllt werden. Nur die Beschriftung geht in den Prompt — damit ein "
                    "Freitextfeld nicht wiederholt, was ein Nachbarfeld schon aufnimmt.")


class Vorschlag(BaseModel):
    feld: str
    label: str
    # Die Typen des Formularfelds, nicht nur Text. Ein Fördersatz kommt als Zahl zurück, eine
    # Mehrfachauswahl als Liste — stand hier `str | None`, verwarf die Antwortprüfung den
    # ganzen Vorschlag mit HTTP 500, und zwar erst NACH den Modellaufrufen. Aufgefallen ist
    # das lange nicht, weil bis dahin nur Textfelder erfragt wurden.
    wert: str | int | float | bool | list[str] | None
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
    # Was bei dieser Antwort nicht durchsucht wurde. Ohne diese Angabe wäre eine
    # Messung gegen einen Holdout von einer gegen den vollen Korpus nicht zu
    # unterscheiden.
    ausgeblendete_dateien: list[str] = []
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
            "vorlage_eingelesen": any(bausteine.values()),
            # Der Holdout gehört hierher, weil er still wirkt: wer ihn vergisst, misst gegen
            # einen Torso und hält ihn für den Korpus.
            "ausgeblendete_dateien": HOLDOUT_DATEIEN}


class RichtlinieAnfrage(BaseModel):
    """Der Entwurf, wie ihn die Node-Seite führt.

    Bewusst nicht nachgebaut: `entwurf` bleibt ein offenes Wörterbuch. Das Schema liegt in
    `packages/shared` und gehört dort hin; es hier ein zweites Mal zu beschreiben hieße,
    zwei Quellen zu pflegen, die auseinanderlaufen können, ohne dass es auffällt. Gelesen
    werden ohnehin nur `sections`, `vermerk` und `validation`.
    """
    entwurf: dict
    abschnitte: list[int] | None = Field(
        default=None, description="nur diese Abschnitte; ohne Angabe 1 bis 8")
    titel: dict[int, str] | None = Field(
        default=None, description="Überschrift je Abschnitt, aus den Abschnittsdefinitionen")
    felder: dict[int, list[FeldDefinition]] | None = Field(
        default=None,
        description="Felddefinitionen je Abschnitt. Nur für die Prüfung auf verworfene "
                    "Optionen: ohne sie kann der Dienst nicht erkennen, dass der Text eine "
                    "Auswahl behauptet, die abgewählt wurde.")


@app.post("/richtlinie")
def richtlinie_bauen(anfrage: RichtlinieAnfrage):
    """Die Richtlinie ausformulieren — der letzte Schritt des Prozessmodells.

    Dauert lange: ein Modellaufruf je Abschnitt, bei acht Abschnitten also mehrere Minuten.
    Für den Durchstich reicht die offene Verbindung; sobald das stört, ist das der erste
    Kandidat für das Auftragsmuster mit Statusabfrage.
    """
    try:
        felder = {nr: [f.model_dump(exclude_none=True) for f in liste]
                  for nr, liste in (anfrage.felder or {}).items()}
        ergebnis = richtlinie.bauen(
            anfrage.entwurf,
            abschnitte=anfrage.abschnitte or range(1, 9),
            titel=anfrage.titel,
            felder=felder or None,
        )
        protokoll.schreibe(
            "richtlinie",
            abschnitte=[a.get("nr") for a in ergebnis.get("abschnitte", [])],
            # Je Abschnitt nur Umfang und Beanstandungen — der Text selbst steht im Entwurf.
            zeichen={a.get("nr"): len(a.get("text") or "")
                     for a in ergebnis.get("abschnitte", [])},
            # `bauen` legt die Nachweisfelder direkt auf die Abschnittsebene, nicht unter
            # „nachweis" — gesucht wurde dort, gefunden nie, und das Protokoll meldete für
            # jeden Abschnitt null Modellaufrufe. Ein Protokoll, das immer dasselbe sagt,
            # sagt nichts, und man merkt es erst, wenn man ihm eine Frage stellt.
            modellaufrufe={a.get("nr"): len(a.get("modelle") or [])
                           for a in ergebnis.get("abschnitte", [])},
            # Mehr als ein Aufruf heisst: der erste Versuch wurde beanstandet und neu
            # geschrieben. Genau das will man nach einem Durchlauf nachlesen können.
            nachgebessert=[a.get("nr") for a in ergebnis.get("abschnitte", [])
                           if len(a.get("modelle") or []) > 1],
            befunde=ergebnis.get("befunde"),
        )
        return ergebnis
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}") from e


@app.post("/pruefen")
async def pruefen(request: Request, datei: str = "entwurf.pdf"):
    """Einen hochgeladenen Richtlinienentwurf gegen die Musterstruktur halten — Phase 2.

    Die Datei kommt als roher Inhalt im Rumpf, nicht als Formular-Upload: das spart die
    Abhängigkeit `python-multipart`, und die Node-Seite reicht die Bytes ohnehin nur durch.
    Der Dateiname steht im Abfrageteil und entscheidet nur über PDF oder DOCX.

    Zwei Stufen laufen hier, beide ohne Modell: zerlegen und Vollständigkeit. Die dritte —
    Feldwerte aus dem Text ziehen — kostet einen Modellaufruf je Baustein und wird deshalb
    ausdrücklich angefordert.
    """
    endung = os.path.splitext(datei)[1].lower()
    if endung not in (".pdf", ".docx"):
        raise HTTPException(status_code=415, detail="Nur PDF und DOCX.")

    inhalt = await request.body()
    if not inhalt:
        raise HTTPException(status_code=400, detail="Leerer Rumpf — keine Datei empfangen.")
    if len(inhalt) > PRUEFUNG_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß ({len(inhalt) // 1024} KB, erlaubt "
                   f"{PRUEFUNG_MAX_BYTES // 1024} KB).")

    # Auf Platte, weil pypdfium2 und python-docx einen Pfad wollen. In ein temporäres
    # Verzeichnis und danach gelöscht: der Entwurf ist fremdes Material, und wir haben
    # keinen Auftrag, ihn zu behalten.
    with tempfile.TemporaryDirectory() as ordner:
        pfad = os.path.join(ordner, os.path.basename(datei))
        with open(pfad, "wb") as f:
            f.write(inhalt)
        try:
            return pruefmodus.pruefen(pfad)
        except Exception as e:
            raise HTTPException(status_code=422,
                                detail=f"Datei nicht lesbar: {type(e).__name__}: {e}") from e


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


class BegruendungAnfrage(BaseModel):
    """Woraus die Suche nach Vorbildern entsteht: der Vermerkseintrag selbst."""
    regel: str = Field(min_length=1, description="Kennung der Prüfregel, etwa bagatellgrenze")
    rechtsstelle: str | None = None
    wert: str | None = Field(default=None, description="Der Wert, der die Regel ausgelöst hat")
    top_k: int = Field(default=3, ge=1, le=10)


class Vorbild(BaseModel):
    fundstelle: str
    text: str
    datei: str | None = None
    seite: int | None = None


@app.post("/begruendung", response_model=list[Vorbild])
def begruendung_vorbilder(anfrage: BegruendungAnfrage):
    """Wie frühere Richtlinien dieselbe Abweichung begründet haben.

    Kein Modellaufruf: gesucht wird, und was gefunden wird, geht unverändert mit
    Quellenangabe zurück. Eine erzeugte Begründung läse sich fertig und würde
    durchgewunken — die Unterschrift unter einem Anschreiben ans MdFE leistet ein Mensch.
    """
    try:
        return begruendung.vorbilder(
            anfrage.regel, anfrage.rechtsstelle, anfrage.wert, top_k=anfrage.top_k)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}") from e


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
            abfrageart=anfrage.abfrageart,
            nachbarfelder=[f.model_dump(exclude_none=True)
                           for f in anfrage.nachbarfelder or []] or None,
            regelfall=anfrage.regelfall,
            entschieden=anfrage.entschieden)
    except Exception as e:
        # Endpunkt weg oder Zeitlimit: 502, nicht 500 — der Fehler liegt stromaufwärts,
        # und die Node-Seite soll ihn als solchen behandeln können.
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}") from e

    if nachweis.get("fehler"):
        raise HTTPException(status_code=502, detail=nachweis["fehler"])
    return {"vorschlaege": vorschlaege, "nachweis": nachweis}
