"""Feldvorschläge für einen Baustein: aus Nutzereingabe wird ein Wert je Formularfeld.

Das ist die Naht zum Frontend. Dessen Chat-Endpunkt gibt heute die Eingabe unverändert in
jedes Zielfeld zurück; hier entsteht der echte Vorschlag — mit Musterbaustein-Bezug,
Belegzitat und Konfidenz.

Die Zielfelder kommen vom Aufrufer, nicht aus diesem Modul. Sie stehen im `packages/shared`
des Frontends (Feldliste, Typ, Optionen), und die Frontend-Seite entscheidet über
`nextChatStage`, welche als nächstes dran sind. Sie hier nachzubauen wäre eine Doppelung mit
stillem Driftrisiko — wer die Auswahl trifft, liefert sie mit.

Rollentrennung der Quellen (siehe prompts/de/feldvorschlag.yaml): Musterbaustein gibt den
Satzrahmen, Eingabe den Inhalt, Retrieval nur den Beleg. Ein Versuch ohne diese Trennung hat
eine Maßnahmenliste aus einer FREMDEN Richtlinie in den Zuwendungszweck geschrieben, mit
Konfidenz 0,99.

    from vorschlag import vorschlagen
    vorschlagen(1, "Tierheime fördern, reine Landesmittel.", [
        {"id": "goal", "label": "Förderziel", "kind": "textarea"},
        {"id": "legalBasis", "label": "Rechtsgrundlage", "kind": "radio",
         "options": [{"value": "lho44", "label": "Zuwendung nach § 44 LHO"}, …]},
    ])
"""
import json
import time
import re
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

import protokoll
import richtlinie
import satzfilter
import musterbausteine
from anfrage import suche
from retrieval import hybrid_search
from rag_query import bloecke_bilden
from llm import chat
import deckung
import profilfilter
from config import (BASE, TOP_K, KONSENS_LAEUFE, KONSENS_SCHWELLE,
                    KONSENS_TEMPERATUR_FELD, HOLDOUT_DATEIEN, ABSCHNITTSBINDUNG,
                    FELDBINDUNG)

loader = PromptLoader(Path(BASE) / "prompts", lang="de")

UNKLAR = "[Unklar]"

# Konfidenz für abgeleitete Auswahlwerte. Das Modell meldet für sie 0,95 und mehr, auch wenn
# die Eingabe zur Sache nichts sagt — gemessen an einer Eingabe ohne jede Angabe zur
# Finanzierungsquelle, die trotzdem „lho44" mit 0,95 lieferte. Die selbstgemeldete Konfidenz
# ist dort also nicht belastbar; das System setzt sie stattdessen selbst.
KONFIDENZ_ABGELEITET = 0.4

# Musterbausteine des EU-Beihilferechts. Außerhalb des PoC-Scopes (nur Landesrecht), und ohne
# Filter füllen sie den halben Satzrahmen von Baustein 1. Erkennung über den Inhalt statt über
# die Nummer: „1.2.n" gilt nur in diesem einen Baustein, die Begriffe überall.
# Ohne abschließende Wortgrenze, mit Absicht: „Beihilferecht" und „Notifizierungen" sind
# Ableitungen, und ein \b am Ende hätte genau die durchgelassen (beobachtet).
_BEIHILFE = re.compile(
    r"\b(AGVO|AgrarGVO|FischGVO|De-?minimis|Notifizierung|Agrarrahmen|Beihilf|"
    r"Artikel 107|Art\. 107|Binnenmarkt|Leitlinien im Fischerei)", re.I)

# Geprüft wird nur der Textanfang. Ein Musterbaustein, der VON Beihilfe handelt, sagt das im
# ersten Satz („AGVO Die Laufzeit …", „Allgemeine De-minimis - VO …"). Einer, der sie nur
# streift, ist Landesrecht — und über den ganzen Text gesucht fiel genau der heraus: am
# Mustersatz zum Inkrafttreten klebt die Überschrift des folgenden Abschnitts, die ihrerseits
# den Beihilfebereich nennt — ein Artefakt der Zeilenzusammenführung. Damit war Baustein 8
# komplett leer.
_BEIHILFE_FENSTER = 80

# Kyrillische und griechische Zwillinge lateinischer Buchstaben. Ein Probelauf lieferte für
# ein Auswahlfeld „lhо44" mit kyrillischem о (U+043E) — optisch nicht zu unterscheiden, gegen
# die Optionsliste ungültig, und NFKC normalisiert es nicht weg. Gegenstück zu
# normalisiereAuswahl() in packages/shared.
_ZWILLINGE = str.maketrans({
    "а": "a", "е": "e", "о": "o", "с": "c", "р": "p", "х": "x", "у": "y", "і": "i",
    "ѕ": "s", "ԁ": "d", "һ": "h", "ν": "v", "ο": "o", "α": "a", "ε": "e", "ι": "i",
})


def normalisieren(wert):
    """Auswahlwert vergleichbar machen: NFKC, Homoglyphen ersetzen, trimmen."""
    return unicodedata.normalize("NFKC", str(wert or "")).translate(_ZWILLINGE).strip()


# Ab dieser Länge ist ein wortgleicher Wert in zwei Feldern kein Zufall mehr.
#
# Kurze Werte teilen sich Felder durchaus zu Recht — zwei Datumsangaben, zweimal „ja", zweimal
# derselbe Ort. Ein ganzer Satz dagegen kann nicht gleichzeitig Förderziel UND Zuwendungszweck
# sein: das eine ist der Zustand, den die Förderung erreichen soll, das andere das, was
# gefördert wird.
DOPPELT_MINDESTLAENGE = 60


def _doppelte_werte_verwerfen(vorschlaege):
    """Zwei Felder mit demselben Satz — das zweite wird verworfen.

    Bei einer langen Eingabe, die mehrere Bausteine auf einmal deckt, füllte das Modell
    Förderziel und Zuwendungszweck mit demselben Rohsatz der Eingabe, beide mit Konfidenz
    0,99 (Durchlauf vom 22.09.2026). Bei kurzen Eingaben waren dieselben Felder sauber
    getrennt und in Verwaltungssprache gebracht — es ist also keine Frage des Könnens,
    sondern der Sorgfalt unter Last.

    Deshalb hier und nicht im Prompt: ob zwei Werte gleich sind, ist ein Zeichenvergleich
    und hängt nicht daran, wie gut eine Formulierung befolgt wird.

    Verworfen wird das SPÄTERE Feld, nicht das frühere. Die Felder stehen in der Reihenfolge
    der Abschnittsdefinition, und die folgt der Musterrichtlinie — das erste Feld ist das,
    für das der Satz am ehesten gemeint war. Ein verworfener Wert wird `[Unklar]`: die
    Bearbeiterin trägt ihn im Formular nach, statt eine Dopplung zu bestätigen.
    """
    befunde, gesehen = [], {}
    for v in vorschlaege:
        wert = v.get("wert")
        if not isinstance(wert, str) or len(wert.strip()) < DOPPELT_MINDESTLAENGE:
            continue
        schluessel = normalisieren(wert).lower()
        if schluessel in gesehen:
            befunde.append(
                f"{v['feld']}: wortgleich mit {gesehen[schluessel]} — verworfen, zwei Felder "
                f"können nicht denselben Satz regeln")
            v["wert"] = UNKLAR
            v["status"] = "unklar"
            v["konfidenz"] = 0.0
            v["deckung"] = None
        else:
            gesehen[schluessel] = v["feld"]
    return befunde


def _ohne_bezug(deckung, wert, feld):
    """Teilt die Deckung kein tragendes Wort mit dem Wert oder seiner Beschriftung?

    Grob mit Absicht, siehe die Begründung an der Aufrufstelle: hier wird nichts beanstandet,
    sondern nur das Etikett heruntergestuft. Verglichen wird gegen drei Dinge, damit eine
    Umschreibung nicht sofort durchfällt — den Wert selbst, die Beschriftung der gewählten
    Option und die des Feldes.
    """
    def woerter(s):
        return {w.lower() for w in re.findall(r"\w{5,}", normalisieren(s))}

    deck = woerter(deckung)
    if not deck:
        return False
    optionen = {o.get("value"): (o.get("label") or "") for o in feld.get("options") or []}
    bezug = woerter(wert) | woerter(feld.get("label") or "")
    for teil in (wert if isinstance(wert, list) else [wert]):
        bezug |= woerter(optionen.get(teil, ""))
    # Zahlen zählen mit: „90 Prozent" deckt einen Fördersatz von 90.
    bezug |= {z for z in re.findall(r"\d+", str(wert))}
    deck |= {z for z in re.findall(r"\d+", str(deckung))}
    return bool(bezug) and not (deck & bezug)


# Die Lücken der Musterrichtlinie: „XX Euro", „bis zum XXX", „<Bezeichnung>".
#
# ENGER gefasst als `richtlinie.PLATZHALTER`, und der Unterschied ist wichtig. Dort wird
# erzeugter Text geprüft, hier ein Zitat aus einer echten Richtlinie. „ggf." gehört dort zu
# den Platzhaltern, weil es als Ausfüllhinweis in der Vorlage steht — in einem
# Korpusdokument ist es gewöhnliches Verwaltungsdeutsch („ggf. erforderliche Unterlagen"),
# und ein Beleg dürfte daran nicht scheitern.
#
# Auch ohne re.I, anders als dort: der Platzhalter ist großgeschrieben. Ein „xx" in einem
# Wort ist keines.
_NOCH_PLATZHALTER = re.compile(r"X{2,}|<[^>]{2,60}>")


def _als_liste(wert):
    """Eine Mehrfachauswahl in eine Liste bringen, wie das Modell sie auch schreibt.

    Verlangt ist eine JSON-Liste, geliefert wird oft eine JSON-Liste ALS ZEICHENKETTE:
    `'["municipal","private"]'`. Ungeprüft wurde daraus ein einziger Eintrag, der zu keiner
    Option passte — die ganze Auswahl fiel als ungültig durch, und der Empfängerkreis blieb
    dreimal in Folge leer, obwohl das Modell die richtige Antwort gegeben hatte.

    Das ist kein Sonderwunsch an ein bestimmtes Modell: JSON in JSON ist der häufigste Weg,
    auf dem eine Liste durch eine Textschnittstelle rutscht. Auch die Aufzählung in einer
    Zeile („Kommunen, Vereine") kommt vor und wird hier aufgetrennt.
    """
    if isinstance(wert, list):
        return wert
    text = str(wert or "").strip()
    if text.startswith("[") and text.endswith("]"):
        try:
            geparst = json.loads(text)
            if isinstance(geparst, list):
                return geparst
        except json.JSONDecodeError:
            pass
    return re.split(r"\s*[,;]\s*|\s+und\s+", text) if text else []


def rahmen(abschnitt_nr, nur_landesrecht=True):
    """Musterbausteine des Abschnitts als Satzrahmen. Leer, wenn die Vorlage fehlt."""
    aus = musterbausteine.laden().get(abschnitt_nr, [])
    if nur_landesrecht:
        aus = [t for t in aus
               if not _BEIHILFE.search((t.get("text") or "")[:_BEIHILFE_FENSTER])]
    return aus


def _rahmen_text(bausteine):
    if not bausteine:
        return "(keine Musterbausteine vorhanden — Vorlage nicht eingelesen)"
    teile = []
    for t in bausteine:
        # Ohne die Anweisungen der Vorlage: Was das Modell nicht sieht, schreibt es nicht ab.
        # Der Wächter in `_pruefen` fängt den Fall hinterher ab und lässt das Feld leer —
        # hier wird er unwahrscheinlich, ohne die Regelung im selben Eintrag zu verlieren.
        text = richtlinie.ohne_redaktionshinweise(t["text"])
        if not text:
            continue
        block = f"[Musterbaustein {t['nummer']}]\n{text}"
        if t.get("hinweis"):
            block += f"\nHinweis an den Ersteller: {t['hinweis']}"
        teile.append(block)
    return "\n\n".join(teile)


def _felder_text(felder):
    zeilen = []
    for f in felder:
        zeile = f"- {f['id']}: {f.get('label') or f['id']}"
        if f.get("options"):
            # Die BESCHRIFTUNG mit der Kennung zeigen, nicht nur die Kennung. Das Formular
            # führt Werte wie „municipal" — die Bearbeiterin schreibt „Kommunen". Ohne die
            # Beschriftung muss das Modell die Übersetzung erraten, und es erriet sie mal so,
            # mal gar nicht: derselbe Empfängerkreis kam einmal als `municipal` zurück und
            # einmal überhaupt nicht.
            werte = ", ".join(
                f"{o['value']} ({o['label']})" if o.get("label") else o["value"]
                for o in f["options"]
            )
            # Mehrfachauswahl war bisher als Einfachauswahl beschrieben. Das Feld
            # „Zuwendungsempfänger" nimmt mehrere Gruppen, und an einer davon — Kommunen —
            # hängt der kommunale Höchstsatz.
            if f.get("kind") == "checkbox":
                zeile += (
                    f"\n    Mehrfachauswahl, eine JSON-Liste dieser Kennungen: {werte}"
                    "\n    Alle zutreffenden nennen, nicht nur die erste."
                )
            else:
                zeile += f"\n    Auswahlfeld, genau eine dieser Kennungen: {werte}"
        elif f.get("kind") in ("number", "date"):
            zeile += f"\n    Typ: {f['kind']}"
        if f.get("help"):
            zeile += f"\n    Hinweis: {f['help']}"
        zeilen.append(zeile)
    return "\n".join(zeilen)


# Die Sorten von Abfragen aus dem Prozessmodell, mit dem Korpusausschnitt, den sie sehen.
#
# Nur die Sorte „vorschlagen" steht hier, weil nur für sie das Modell einen allgemeinen
# Filter nennt — und zwar an drei Stellen gleichlautend: als Hilfestellung ausschließlich
# frühere Richtlinien des Landes und der GAK, auch bei einer Richtlinie ohne GAK-Bezug. Für
# die Sorten „übernehmen" und „belegen" benennt das Modell jeweils ein bestimmtes Dokument,
# keinen Ausschnitt nach Art; die bekommen ihren Filter deshalb vom Aufrufer und keinen
# Namen hier.
#
# Der Unterschied ist haftungsrelevant, nicht technisch: ein Fund aus einer Vorschrift ist
# Wortlaut mit Fundstelle, ein Vorschlag aus einer fremden Richtlinie ist ein Entwurf zur
# Bestätigung. Sieht beides gleich aus, wird eine Anlehnung für eine Rechtsgrundlage
# gehalten.
ABFRAGEARTEN = {
    "vorschlagen": ["richtlinie", "rahmenplan"],
}

# Die Rolle der Belegstellen im Prompt, je Abfragesorte. Siehe feldvorschlag.yaml.
#
# Der Regelfall verbietet jede inhaltliche Übernahme — die Regel entstand, nachdem ein Lauf
# eine Maßnahmenliste aus einer fremden Richtlinie in den Zuwendungszweck geschrieben hatte.
_ROLLE_NACHWEIS = (
    "- BELEGSTELLEN dienen ausschliesslich dem Nachweis. Aus ihnen übernimmst du KEINE\n"
    "    inhaltlichen Festlegungen. Insbesondere keine Vorhaben, Zielgruppen, Beträge oder\n"
    "    Ausschlüsse aus anderen Richtlinien — auch dann nicht, wenn sie gut passen."
)

# Beim Vorschlagen ist genau das der Auftrag. Das Prozessmodell verlangt „Vorschläge aus
# alten Förderverfahren" und nennt den Musterfall selbst: eine bestehende Richtlinie enthält
# ähnliche Voraussetzungen für eine neue. Die Grenze verläuft nicht zwischen Übernehmen und
# Nicht-Übernehmen, sondern zwischen REGELUNGSART und EINZELHEIT — und zwischen Vorschlag
# und Feststellung.
_ROLLE_VORBILD = (
    "- BELEGSTELLEN sind hier VORBILDER aus früheren Förderverfahren des Landes, keine\n"
    "    Vorschriften. Für diesen Schritt darfst du dich inhaltlich an ihnen orientieren:\n"
    "    was vergleichbare Richtlinien an dieser Stelle geregelt haben, ist ein zulässiger\n"
    "    Entwurf. Dabei gilt:\n"
    "    - Es ist ein VORSCHLAG ZUR BESTÄTIGUNG, keine Feststellung. Schweigt die Angabe\n"
    "      des Fachreferats dazu — hier der Regelfall —, setze \"deckung\" auf null.\n"
    "    - Übernimm die REGELUNGSART, nicht die Einzelheiten des fremden Verfahrens. Keine\n"
    "      Beträge, Fristen, Gebietskulissen, Zielgruppen oder Vorhaben, die dort stehen und\n"
    "      hier nicht genannt sind.\n"
    "    - Schreibe nichts wörtlich ab. Ein Wert, der wörtlich in einer Fundstelle steht,\n"
    "      wird maschinell erkannt und verworfen.\n"
    "    - Lässt sich auch so nicht sagen, was hier gelten soll, bleibt \"[Unklar]\" richtig."
)

_UEBERSCHRIFT = {
    None: "BELEGSTELLEN (nur Nachweis, keine Inhaltsquelle):",
    "vorschlagen": "BELEGSTELLEN — VORBILDER aus früheren Verfahren (Orientierung erlaubt):",
}


def ebenen_fuer(gak=False, beihilfe=False):
    """Welche Rechtsebenen für diesen Entwurf überhaupt einschlägig sind.

    Landesrecht immer: VV und VVG zu § 44 LHO, ANBest, die Grundsätze für Förderrichtlinien
    und die bestehenden Landesrichtlinien.

    Bundesrecht nur bei GAK-Kofinanzierung — der Rahmenplan bindet dann, sonst gilt er nicht.
    EU-Recht nur bei Beihilfebezug: AGVO, De-minimis und die Leitlinien greifen nur, wenn die
    Förderung überhaupt eine Beihilfe ist.

    Der Anlass ist gemessen: Bei der Beurteilung der Formular-Fundstellen am 08.10.2026 wurden
    24 von 66 Stellen als unbrauchbar eingestuft, und die Begründungen nannten durchgehend ein
    fremdes Förderregime — Binnenmarktvereinbarkeit, GAP-Strategieplan, AgrarGVO — für eine
    Tierschutzrichtlinie aus reinen Landesmitteln. Der Korpus führt 818 Chunks auf Landesebene
    und 4692 auf Bundes- und EU-Ebene; ohne Eingrenzung sucht das Werkzeug zu 85 Prozent im
    Unzutreffenden.

    Großzügig im Zweifel: Wer nichts angibt, bekommt nur Landesrecht — aber `gak` und
    `beihilfe` kommen aus bestätigten Angaben des Entwurfs, nicht aus einer Vermutung.
    """
    ebenen = ["Land"]
    if gak:
        ebenen.append("Bund")
    if beihilfe:
        ebenen.append("EU")
    return ebenen


# Wie viele Stellen je ZIELFELD geholt werden. Klein, weil es mehrere Felder sind — die
# Summe soll nicht größer werden als die eine Anfrage vorher.
TREFFER_JE_FELD = 3

# Wie lang das Zitat einer Fundstelle in der Oberfläche höchstens ist. Es soll zum Verwerfen
# reichen, nicht zum Lesen — wer mehr will, schlägt das Dokument auf.
ZITAT_ZEICHEN = 400

# Der Anfang des nächsten Gliederungspunkts, der am Ende eines Blocks klebt.
#
# Ein Chunk endet nicht an der Abschnittsgrenze. Im Durchlauf vom 08.10.2026 stand unter
# „Zuwendungsempfänger" ein Zitat, das mit der Empfängerliste begann und mit „- 4
# Zuwendungsvoraussetzungen - 4.1 Die Vorhaben dürfen …" endete — die Überschrift des
# FOLGENDEN Abschnitts samt erstem Satz. Wer das liest, hält die Stelle für unsauber, obwohl
# die Suche richtig lag.
_NAECHSTER_PUNKT = re.compile(r"[-–]\s*\d+(?:\.\d+)*\s+[A-ZÄÖÜ]")

# Ab welchem Anteil des Textes ein Gliederungspunkt als Überhang gilt.
#
# Unterschieden wird an zwei Merkmalen. Eine Fundstelle, die SELBST eine nummerierte
# Aufzählung ist, beginnt mit einem Gliederungspunkt — dort wird nichts geschnitten, sonst
# bliebe vom Fund die erste Zeile übrig. Beginnt sie mit Fließtext und kommt in der zweiten
# Hälfte ein Punkt, ist das der nächste Abschnitt, der am Chunk klebt.
UEBERHANG_AB = 0.5


def zitat_bilden(text, zeichen=ZITAT_ZEICHEN):
    """Den Blocktext auf ein lesbares Zitat kürzen — an einer Satzgrenze, ohne Überhang.

    Zuerst der angefangene nächste Gliederungspunkt am Ende, dann die Länge: an der letzten
    Satzgrenze davor, damit das Zitat nicht mitten im Wort abbricht. Gibt es keine, wird hart
    geschnitten und mit Auslassung gekennzeichnet — ein sichtbar gekürztes Zitat ist ehrlicher
    als eines, das vollständig aussieht.
    """
    t = " ".join(str(text or "").split())
    beginnt_mit_punkt = bool(_NAECHSTER_PUNKT.match(t) or re.match(r"\s*\d+(?:\.\d+)*\s", t))
    if not beginnt_mit_punkt:
        for m in _NAECHSTER_PUNKT.finditer(t):
            if m.start() >= len(t) * UEBERHANG_AB:
                t = t[:m.start()].strip(" -–,;")
                break
    if len(t) <= zeichen:
        return t or None
    schnitt = t[:zeichen]
    satzende = max(schnitt.rfind(". "), schnitt.rfind("! "), schnitt.rfind("? "))
    if satzende >= zeichen // 2:
        return schnitt[:satzende + 1]
    return schnitt.rsplit(" ", 1)[0] + " …"


def ist_belegsatz(text):
    """Taugt dieser Textrest als Fundstelle — oder ist es ein Tabellen- oder Verzeichnisrest?

    Gegenstück zu `istBelegSatz` in packages/shared, wo es seit dem 29.09.2026 für das
    Belegzitat eines Vorschlags gilt. Die Fundstellenliste der Oberfläche ging daran vorbei,
    und prompt stand unter „Kriterien für die Erfolgskontrolle" ein eingelesenes
    Inhaltsverzeichnis: „1.1, Zuwendungszweck, Rechtsgrundlage = Zuwendungszweck. 1.1, 2 = 2."

    Das Gleichheitszeichen ist das Erkennungsmerkmal: Es trennt in der eingelesenen Tabelle
    Zelle von Zelle und kommt in Rechtstext praktisch nicht vor.
    """
    t = (text or "").strip()
    if len(t) < 40 or "=" in t or t.endswith(".."):
        return False
    return bool(re.search(r"[.!?][)\"\u201d\u00bb]?$", t)) or len(t) >= 120


def belege_je_feld(felder, kontext, abschnitt_nr, uhr=None, zaehler=None, **filter_args):
    """Je Zielfeld eine eigene Suche. Ergibt (bloecke, metas) wie `belege_holen`.

    Eine gemeinsame Anfrage für alle offenen Felder eines Abschnitts stellt mehrere Fragen auf
    einmal — „Konkretisierung der Zielgruppe, Ausgeschlossene Gruppen, Weiterleitung an
    Dritte" — und was zurückkommt, beantwortet bestenfalls eine davon. Bei der Beurteilung der
    Formular-Fundstellen am 08.10.2026 begründete das prüfende Modell ALLE 22 verworfenen
    Stellen mit demselben Muster: „regelt die Finanzierungsart, aber nicht den Höchstbetrag",
    „handelt von Zuwendungsvoraussetzungen, aber nicht von ausgeschlossenen Gruppen".
    Richtiger Abschnitt, falsches Feld. Die Abschnittsbindung kann das nicht auflösen: Baustein
    5 hat elf Felder und ist für alle elf derselbe Baustein.

    Ohne Reranking je Teilanfrage. Es ist ein Modellaufruf, und bei bis zu elf Feldern wären
    das elf — die Zusammenführung leistet hier, was der Reranker leisten soll: Jedes Feld
    bekommt seine eigene Trefferliste, statt um Plätze in einer gemeinsamen zu konkurrieren.

    Der Satzfilter läuft je Feld mit dem FELDNAMEN als Anliegen. Dasselbe Argument: Er wählt
    die tragenden Sätze aus einem Block, und welche tragen, hängt an der Frage.
    """
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=min(len(felder), 6)) as pool:
        listen = list(pool.map(
            lambda f: hybrid_search(f"{f.get('label') or f.get('id')}. {kontext}".strip(),
                                    top_k=TREFFER_JE_FELD, rerank=False, **filter_args),
            felder))
    if uhr is not None:
        uhr["belege_suche"] = round(time.monotonic() - t0, 1)

    t0 = time.monotonic()
    alle, metas, gesehen, beurteilt, ohne_satz = [], [], set(), 0, 0
    for feld, treffer in zip(felder, listen):
        bloecke = bloecke_bilden(treffer)
        if not bloecke:
            continue
        bloecke, m = satzfilter.filtern(feld.get("label") or feld.get("id"), bloecke)
        metas += m
        for b in bloecke:
            if b["gefiltert"]:
                beurteilt += 1
                if not b["indizes"]:
                    ohne_satz += 1
            # Ein Block ohne gewählten Satz belegt nichts — wie in `belege_holen`.
            if b["gefiltert"] and not b["indizes"]:
                continue
            # Und ein Tabellen- oder Verzeichnisrest belegt auch nichts, so lang er ist.
            if not ist_belegsatz(b.get("kurz") or b.get("roh")):
                continue
            pid = (b["punkt"].payload or {}).get("parent_id")
            if pid in gesehen:
                continue
            gesehen.add(pid)
            # Woraufhin diese Stelle gefunden wurde. Ohne die Angabe steht in der Oberfläche
            # eine Liste, der nicht anzusehen ist, welches Feld sie belegen soll.
            b["feld"] = feld.get("id")
            b["feld_label"] = feld.get("label")
            alle.append(b)
    if uhr is not None:
        uhr["belege_satzfilter"] = round(time.monotonic() - t0, 1)
    if zaehler is not None:
        zaehler["gefunden"] = sum(len(t) for t in listen)
        zaehler["beurteilt"] = beurteilt
        zaehler["verworfen"] = beurteilt - len(alle)
        if beurteilt:
            zaehler["verwurfsquote"] = round(ohne_satz / beurteilt, 2)
    # Neu durchnummerieren: Die Kennungen sind das, worauf das Modell im Prompt zeigt, und sie
    # müssen über die zusammengeführte Liste eindeutig sein.
    for i, b in enumerate(alle, 1):
        b["id"] = f"{i:04d}"
    return alle, metas


def belege_holen(eingabe, abschnitt_nr, top_k=TOP_K, uhr=None, nur_arten=None,
                 ohne_dateien=None, zaehler=None, nur_baustein=None, nur_quellen=None):
    """Belegstellen zum Anliegen: Hybrid-Suche, dann Satzfilter. Nur Nachweis, keine Werte.

    `nur_baustein`: nur Fundstellen aus diesem Baustein anderer Richtlinien, siehe
    `config.ABSCHNITTSBINDUNG`.

    `nur_quellen`: nur Fundstellen aus diesen Richtlinien, siehe `profilfilter`.

    `uhr`: optionales Wörterbuch, in das die Teilzeiten geschrieben werden. Die beiden
    Schritte sind sehr verschieden teuer — die Suche stellt mehrere Teilanfragen mit je einem
    Embedding-Aufruf, der Satzfilter ruft das Modell je Stapel. Wer beschleunigen will, muss
    wissen, welcher von beiden es ist.

    `zaehler`: optionales Wörterbuch für die Trefferzahlen — wie viele Blöcke die Suche
    brachte und wie viele davon der Satzfilter als unergiebig verworfen hat.

    Die Verwurfsquote ist die Antwort auf eine Frage, die das Werkzeug bisher nicht messen
    konnte: „findet die Suche Themenfremdes?" Der Satzfilter beurteilt JEDEN gefundenen Block
    darauf, ob ein einschlägiger Satz darin steht — ein Relevanzurteil je Block, bei jedem
    Aufruf, ohne zusätzlichen Modellaufruf. Bis zum 24.09.2026 wurde dieses Urteil benutzt und
    weggeworfen; das Protokoll wusste danach nur, was übrig blieb, nicht wie viel weg musste.
    """
    t0 = time.monotonic()
    treffer = suche(eingabe, abschnitt_nr=abschnitt_nr, top_k=top_k,
                    nur_arten=nur_arten, ohne_dateien=ohne_dateien,
                    nur_baustein=nur_baustein, nur_quellen=nur_quellen)
    bloecke = bloecke_bilden(treffer)
    if uhr is not None:
        uhr["belege_suche"] = round(time.monotonic() - t0, 1)
    if zaehler is not None:
        zaehler["gefunden"] = len(bloecke)
    if not bloecke:
        return [], []

    t0 = time.monotonic()
    bloecke, metas = satzfilter.filtern(eingabe, bloecke)
    if uhr is not None:
        uhr["belege_satzfilter"] = round(time.monotonic() - t0, 1)
    # Ein Block ohne gewählten Satz belegt nichts und fliegt raus — wie in rag_query.
    behalten = [b for b in bloecke if not (b["gefiltert"] and not b["indizes"])]
    if zaehler is not None:
        zaehler["verworfen"] = len(bloecke) - len(behalten)
        # Nur über die Blöcke, die der Filter überhaupt beurteilt hat. Ein Ausfall des
        # Filters ist kein Relevanzurteil und darf die Quote nicht schönen.
        beurteilt = [b for b in bloecke if b["gefiltert"]]
        zaehler["beurteilt"] = len(beurteilt)
        if beurteilt:
            ohne_satz = sum(1 for b in beurteilt if not b["indizes"])
            zaehler["verwurfsquote"] = round(ohne_satz / len(beurteilt), 2)
    return behalten, metas


def _norm(s):
    """Für Zeichenvergleiche: NFKC, weiche Trennstriche weg, Leerraum vereinheitlicht."""
    s = unicodedata.normalize("NFKC", str(s or ""))
    return re.sub(r"\s+", " ", s.replace("­", "")).strip().lower()


def _woertlich_in(zitat, *quellen):
    """Steht das Zitat wörtlich in einer der Quellen? Zeichenvergleich, kein Modellaufruf.

    Dieselbe Idee wie satzfilter.beleg_pruefen, nur gegen mehrere Texte: ein Beleg darf aus
    den Fundstellen ODER aus einem Musterbaustein stammen, und die Deckung eines Wertes aus
    der Eingabe. Ein nicht gedecktes Zitat ist kein Abbruchgrund, aber ein Befund.

    Sehr kurze Zeichenketten gelten als gedeckt: unter etwa einem Dutzend Zeichen trifft
    fast alles irgendwo, die Prüfung sagt dann nichts mehr aus.
    """
    if not zitat:
        return False
    nadel = _norm(zitat)
    if len(nadel) < 12:
        return True
    return any(nadel in _norm(q) for q in quellen if q)


def _beleg_gedeckt(zitat, bloecke, rahmen_text=""):
    """Rückwärtskompatible Hülle: Beleg gegen Fundstellen und Musterbausteine."""
    if not zitat:
        return True
    fundstellen = " ".join(b.get("kurz") or b["roh"] for b in bloecke)
    return _woertlich_in(zitat, fundstellen, rahmen_text)


def _antwort_lesen(roh):
    """Vorschlagsliste aus der Modellantwort. Leer, wenn nichts Brauchbares kommt."""
    treffer = re.search(r"\{.*\}", roh or "", re.S)
    if not treffer:
        return []
    try:
        return json.loads(treffer.group(0)).get("vorschlaege") or []
    except json.JSONDecodeError:
        return []


def _abstimmen(laeufe_daten, felder, laeufe, schwelle):
    """Mehrheitsentscheid über mehrere Läufe. Ergibt (vorschlaege, befunde).

    Warum überhaupt: derselbe Fall lieferte in drei Läufen drei Ergebnisse — zweimal
    „administrative", einmal „[Unklar]". Bei einer Auswahlfrage ist ein Einzellauf damit
    keine Aussage. Dasselbe Verfahren nutzt retrieval.py schon für die Kandidatenauswahl.

    Abgestimmt wird verschieden, je nach Feldart:
    - AUSWAHLFELDER über den Wert. Erreicht keiner die Schwelle, ist das Ergebnis
      „[Unklar]" — der Entscheid darf verwerfen.
    - FREITEXT über die Frage, ob das Feld überhaupt beantwortbar ist. Über Formulierungen
      lässt sich nicht abstimmen; über „lässt sich das aus der Angabe sagen?" schon, und
      genau daran ist die Naht zweimal gescheitert.

    Die Konfidenz ist danach der Anteil der zustimmenden Läufe — eine gemessene Zahl statt
    der Selbstauskunft des Modells.
    """
    befunde, heraus = [], []
    for feld in felder:
        fid = feld["id"]
        stimmen = [v for daten in laeufe_daten for v in daten if v.get("feld") == fid]
        if not stimmen:
            continue
        unklar_n = sum(1 for v in stimmen
                       if normalisieren(v.get("wert")).lower() == UNKLAR.lower())
        sagbar = [v for v in stimmen
                  if normalisieren(v.get("wert")).lower() != UNKLAR.lower()]

        if feld.get("options"):
            zaehler = Counter(normalisieren(v.get("wert")) for v in sagbar)
            if zaehler and zaehler.most_common(1)[0][1] >= schwelle:
                wert, n = zaehler.most_common(1)[0]
                gewinner = next(v for v in sagbar if normalisieren(v.get("wert")) == wert)
                gewinner["konfidenz"] = round(n / laeufe, 2)
                if n < laeufe:
                    befunde.append(f"{fid}: {n} von {laeufe} Läufen einig ({wert})")
                heraus.append(gewinner)
            else:
                verteilung = ", ".join(f"{w}×{n}" for w, n in zaehler.most_common()) or "keine"
                befunde.append(f"{fid}: keine Mehrheit ({verteilung}, {unklar_n}× [Unklar]) "
                               f"— als [Unklar] gewertet")
                heraus.append({"feld": fid, "wert": UNKLAR, "quelle": "unklar",
                               "konfidenz": round(len(sagbar) / laeufe, 2)})
        else:
            if len(sagbar) >= schwelle:
                gewinner = sagbar[0]
                gewinner["konfidenz"] = round(len(sagbar) / laeufe, 2)
                heraus.append(gewinner)
            else:
                befunde.append(f"{fid}: nur {len(sagbar)} von {laeufe} Läufen hielten das "
                               f"Feld für beantwortbar — als [Unklar] gewertet")
                heraus.append({"feld": fid, "wert": UNKLAR, "quelle": "unklar",
                               "konfidenz": round(len(sagbar) / laeufe, 2)})
    return heraus, befunde


def _deckungen_nachpruefen(vorschlaege, uhr=None):
    """Stützt die angegebene Stelle den Wert wirklich? — NICHT im Einsatz, siehe unten.

    Gebaut am 09.10.2026 gegen drei Fehler des Durchlaufs vom Vortag und am selben Tag wieder
    ausgehängt, weil das bewertende Modell sie nicht findet. Vorgelegt wurden ihm zwei falsche
    Deckungen und eine richtige; es urteilte dreimal „trägt". Bei der falschen Zielgruppe
    („Tierärztinnen und Tierärzte" als Zuwendungsempfänger, Deckung „Gefördert wird die
    Kastration … DURCH Tierärztinnen und Tierärzte") begründete es mit „die die Kastration
    durchführen und gefördert werden" — die zweite Hälfte hat es selbst ergänzt. Auch mit
    Abschnittsbezug im Feldnamen blieb es bei dreimal „trägt".

    Steht hier, damit der Versuch nicht ein zweites Mal gemacht wird. Wer ihn wiederholt,
    braucht zuerst ein strengeres Urteilsverfahren — ein anderes Modell oder einen Prompt, der
    die Richtung einer Aussage prüft („durch X" ist nicht „an X").

    Der Rest der Mechanik stimmt: Urteile nebenläufig, nur für Felder mit Deckung, Ausfall des
    Modells lässt das Etikett unverändert. Wieder einhängen heißt: diesen Aufruf hinter
    `_doppelte_werte_verwerfen` setzen.
    """
    betroffen = [v for v in vorschlaege if v.get("deckung")]
    if not betroffen:
        return []
    t0 = time.monotonic()
    urteile = deckung.mehrere_beurteilen(
        [(v["label"], v["wert"], v["deckung"]) for v in betroffen])
    if uhr is not None:
        uhr["deckung_pruefen"] = round(time.monotonic() - t0, 1)

    befunde = []
    for v, (urteil, warum, _) in zip(betroffen, urteile):
        if urteil in deckung.NICHT_GEDECKT:
            v["deckung"] = None
            befunde.append(f"{v['feld']}: Deckung trägt den Wert nicht ({urteil}) — "
                           f"als abgeleitet ausgewiesen. {warum}")
    return befunde


# Ein Titel, den die Bearbeiterin selbst geschrieben hat, wird übernommen und nicht umformuliert.
#
# Die Regel „WERT FORMULIEREN, NICHT ZITIEREN" im Prompt ist für Regelungstext richtig und für
# den Titel falsch. Im Durchlauf vom 09.10.2026 gab die Bearbeiterin „Richtlinie des
# Ministeriums … über die Gewährung von Zuwendungen zur Kastration …" wörtlich vor — also
# genau die Form der VV zu § 44 LHO — und bekam „FÖRDERrichtlinie … ZUR Gewährung von
# Zuwendungen FÜR Kastration" zurück. Drei Abweichungen ohne Anlass.
#
# Deterministisch und nicht über den Prompt: Ob eine Zeile ein Richtlinientitel ist, ist eine
# Formfrage und keine Ermessensfrage.
_TITELZEILE = re.compile(r"^\s*((?:Förder)?[Rr]ichtlinie\s+(?:des|der|über|zur|zum)\s.{30,400})$")


def titel_aus_eingabe(eingabe):
    """Die erste Zeile der Eingabe, die schon ein Richtlinientitel ist. Sonst None."""
    for zeile in str(eingabe or "").splitlines():
        treffer = _TITELZEILE.match(zeile.strip())
        if treffer:
            return treffer.group(1).strip().rstrip(".")
    return None


def _pruefen(v, feld, bloecke, rahmen_text="", eingabe="", abfrageart=None):
    """Nachprüfungen an einem Modellvorschlag. Verändert `v` und ergänzt `befunde`."""
    befunde = []
    wert_roh = v.get("wert")
    unklar = normalisieren(wert_roh).lower() == UNKLAR.lower()

    # Deckung: welche Stelle der Eingabe trägt den Wert? Das Modell benennt sie, wir prüfen
    # sie wörtlich nach. Was es nicht in der Eingabe zeigen kann, ist abgeleitet — und das
    # ist die belastbare Grundlage für die Konfidenz, nicht die Selbstauskunft des Modells.
    v["gedeckt_durch_eingabe"] = bool(
        v.get("deckung") and _woertlich_in(v["deckung"], eingabe))
    if v.get("deckung") and not v["gedeckt_durch_eingabe"]:
        befunde.append(f"{feld['id']}: angebliche Deckung steht nicht in der Angabe — "
                       f"{str(v['deckung'])[:100]!r}")

    # Die Deckung ist ECHT — trägt sie auch den Wert?
    #
    # Bisher wurde nur nachgeprüft, ob das Zitat wörtlich in der Eingabe steht. Am 24.09.2026
    # stand deshalb unter „Anforderungs- und Auszahlungsverfahren: Erstattungsprinzip" die
    # Deckung „Fördersatz beträgt 90 Prozent, als Anteilfinanzierung in Form eines
    # Zuschusses" — ein echtes Zitat, das über Vorschuss oder Erstattung nichts sagt. Ein
    # ungedeckter Wert, der sich als gedeckt ausgibt, entgeht auch dem aufmerksamen
    # Gegenlesen.
    #
    # Geprüft wird auf gemeinsame Wörter, und das ist bewusst grob: „Die Auszahlung erfolgt
    # nach Abschluss der Maßnahme gegen Nachweis" stützt das Erstattungsprinzip, ohne ein
    # Wort mit ihm zu teilen. Deshalb gibt es hier KEINEN Befund — die Behauptung wird nur
    # abgeschwächt. Ein zu vorsichtiges „bitte prüfen" kostet einen Blick, ein falsches
    # „gedeckt" kostet die Prüfung ganz.
    #
    # Die inhaltliche Prüfung — stützt die Stelle die Aussage wirklich? — braucht ein
    # bewertendes Modell und steht weiter aus.
    if v["gedeckt_durch_eingabe"] and _ohne_bezug(v.get("deckung"), wert_roh, feld):
        v["gedeckt_durch_eingabe"] = False
        befunde.append(
            f"{feld['id']}: Deckung ohne erkennbaren Bezug zum Wert — als abgeleitet "
            f"behandelt statt als gedeckt")

    if unklar:
        v["wert"] = UNKLAR
        v["status"] = "unklar"
        v["konfidenz"] = min(float(v.get("konfidenz") or 0.0), 0.3)
        return befunde

    if feld.get("options"):
        erlaubt = {normalisieren(o["value"]): o["value"] for o in feld["options"]}
        # Auch die Beschriftung zulassen: das Modell antwortet gelegentlich mit dem, was es
        # der Bearbeiterin vorlesen würde („Kommunen und kommunale Einrichtungen") statt mit
        # der Kennung. Das ist der richtige Wert, nur in der falschen Schreibweise — ihn als
        # „gehört nicht zur Auswahl" zu verwerfen, wäre Buchhaltung gegen die Sache.
        for o in feld["options"]:
            if o.get("label"):
                erlaubt.setdefault(normalisieren(o["label"]), o["value"])

        # Mehrfachauswahl: das Feld hält eine Liste, und jeder Eintrag wird einzeln geprüft.
        # Ein unbekannter Eintrag verwirft nicht die ganze Auswahl — die übrigen sind
        # deswegen nicht falsch.
        if feld.get("kind") == "checkbox":
            roh = _als_liste(wert_roh)
            gewaehlt, unbekannt = [], []
            for teil in roh:
                treffer = erlaubt.get(normalisieren(teil))
                if treffer is None:
                    unbekannt.append(str(teil))
                elif treffer not in gewaehlt:
                    gewaehlt.append(treffer)
            if unbekannt:
                befunde.append(
                    f"{feld['id']}: {', '.join(repr(u) for u in unbekannt)} "
                    "gehört nicht zur Auswahl")
            if gewaehlt:
                v["wert"] = gewaehlt
                v["status"] = "suggested"
            else:
                v["status"] = "invalid"
        else:
            treffer = erlaubt.get(normalisieren(wert_roh))
            if treffer is None:
                v["status"] = "invalid"
                befunde.append(f"{feld['id']}: {wert_roh!r} gehört nicht zur Auswahl")
            else:
                if treffer != str(wert_roh).strip():
                    befunde.append(
                        f"{feld['id']}: Wert erst nach Normalisierung lesbar "
                        f"({str(wert_roh).strip()!r} -> {treffer!r})")
                v["wert"] = treffer
                v["status"] = "suggested"
    else:
        v["status"] = "suggested"

    # Konfidenz für Auswahlfelder setzt das System, nicht das Modell: dessen Selbstauskunft
    # lag bei einer Eingabe ohne jede Angabe zur Finanzierungsquelle bei 0,95. Maßstab ist
    # die nachgeprüfte Deckung — nicht, ob der Wert aus dem Musterbaustein formuliert wurde.
    # Die frühere Regel „Quelle ≠ Eingabe → kappen" verwechselte beides und kappte auch dann,
    # wenn die Angabe den Wert ausdrücklich trug.
    # Ein ungedeckter Wert bekommt seine Konfidenz vom System, nicht vom Modell — dessen
    # Selbstauskunft ist hier nicht belastbar (0,95 für ein Feld, zu dem die Eingabe schwieg).
    #
    # Die Abfragesorte entscheidet über den Wortlaut des Befundes, und das ist kein
    # Schönheitsfehler: „aus dem Regelfall abgeleitet" verweist auf die Musterrichtlinie,
    # „nach dem Vorbild" auf ein fremdes Verfahren. Das eine ist der vorgesehene Normalfall,
    # das andere eine Anlehnung, die bestätigt werden muss. Wer den Prüfvermerk liest, muss
    # die beiden auseinanderhalten können.
    ungedeckt = v.get("status") == "suggested" and not v["gedeckt_durch_eingabe"]
    if abfrageart == "vorschlagen" and ungedeckt:
        v["konfidenz"] = min(float(v.get("konfidenz") or 1.0), KONFIDENZ_ABGELEITET)
        befunde.append(f"{feld['id']}: nach dem Vorbild eines früheren Verfahrens "
                       f"vorgeschlagen, nicht durch die Angabe gedeckt")
    elif ungedeckt:
        # Gilt für JEDES Feld, nicht nur für Auswahlfelder. Im Durchlauf vom 22.09.2026 stand
        # in der beihilferechtlichen Rechtsgrundlage — einem Freitextfeld — der Satz „Die
        # Förderung stellt Beihilfen im Sinne von Artikel 107 Absatz 1 AEUV dar", mit 0,9
        # Konfidenz und ohne eine Silbe dazu in der Eingabe. Gerade im Freitext ist die
        # Selbstauskunft des Modells wertlos: dort kann es formulieren, was es für üblich
        # hält, und klingt dabei ebenso sicher wie bei einem abgeschriebenen Wert.
        v["konfidenz"] = min(float(v.get("konfidenz") or 1.0), KONFIDENZ_ABGELEITET)
        befunde.append(f"{feld['id']}: aus dem Regelfall abgeleitet, die Angabe deckt ihn nicht")

    # Abgeschrieben: der Wert steht wörtlich in einer Fundstelle, aber die Angabe des
    # Fachreferats trägt ihn nicht. Das ist der Fehler, der diese Naht zweimal getroffen hat
    # — beim zweiten Mal begünstigt durch die Belegpflicht, die Werte belohnt, die sich
    # zitieren lassen. Am leichtesten zitierbar ist die abgerufene fremde Richtlinie.
    #
    # Beide Hälften sind zeichengenau prüfbar, deshalb steht die Regel hier und nicht im
    # Prompt: sie hängt nicht davon ab, wie gut eine Formulierung befolgt wird.
    if (not unklar and not feld.get("options") and not v["gedeckt_durch_eingabe"]
            and _woertlich_in(wert_roh, " ".join(b.get("kurz") or b["roh"] for b in bloecke))):
        v["status"] = "invalid"
        v["wert"] = UNKLAR
        v["konfidenz"] = 0.0
        befunde.append(
            f"{feld['id']}: Wert wörtlich aus einer Fundstelle übernommen, ohne Deckung in "
            f"der Angabe — verworfen")
        return befunde

    # Der Titel wird übernommen, nicht umformuliert — siehe `titel_aus_eingabe`.
    if feld["id"] == "title":
        eigener = titel_aus_eingabe(eingabe)
        if eigener and _norm(eigener) != _norm(v.get("wert")):
            befunde.append(f"title: Titel der Bearbeiterin wörtlich übernommen statt "
                           f"umformuliert — {str(v.get('wert'))[:80]!r}")
            v["wert"] = eigener
            v["deckung"] = eigener
            v["gedeckt_durch_eingabe"] = True
            v["konfidenz"] = 1.0

    # Redaktionshinweise der Vorlage sind kein Richtlinientext.
    #
    # Der Musterbaustein zu den Förderausschlüssen ist 702 Zeichen lang und mischt Anweisung,
    # Regelung, Beispielliste, zwei Varianten und einen Platzhalter in einer Zelle. Im
    # Durchlauf vom 08.10.2026 hat das Modell ihn dreimal abgeschrieben — als Förderausschluss
    # standen danach Erbbauzinsen und Grunderwerbsteuer in einer Katzenrichtlinie, gefolgt
    # von den Variantenmarken und dem Platzhalter für das Fachreferat.
    #
    # Verworfen und nicht abgeschnitten: Wo die Anweisung steht, ist auch der Rest ungeprüft
    # übernommen. Ein leeres Feld mit Befund ist ehrlicher als ein halb gesäuberter Vorlagentext
    # — zumal die Fundstelle daneben in allen drei Fällen die bessere Antwort enthielt.
    if richtlinie.ist_redaktionshinweis(v.get("wert")):
        befunde.append(
            f"{feld['id']}: Redaktionshinweis der Vorlage als Wert übernommen — verworfen: "
            f"{str(v.get('wert'))[:120]!r}")
        v["wert"] = UNKLAR
        v["status"] = "unklar"
        v["konfidenz"] = 0.0
        v["deckung"] = None
        return befunde

    if v.get("belegzitat") and not _beleg_gedeckt(v["belegzitat"], bloecke, rahmen_text):
        # Wortlaut mitgeben: ohne ihn ist nicht zu unterscheiden, ob das Modell erfunden hat
        # oder aus einer anderen zulässigen Quelle zitiert.
        befunde.append(f"{feld['id']}: Belegzitat steht so nicht in den Fundstellen — "
                       f"{str(v['belegzitat'])[:120]!r}")
        v["belegzitat"] = None
        v["beleg_geprueft"] = False
    elif v.get("belegzitat") and _NOCH_PLATZHALTER.search(str(v["belegzitat"])):
        # Ein Belegzitat mit Platzhalter belegt nichts.
        #
        # Ein Beleg darf aus einem Musterbaustein stammen — das ist Absicht, der Satzrahmen
        # ist oft die genauere Quelle. Steht darin aber noch die Lücke der Vorlage, ist er
        # als Beleg wertlos: ein Mustersatz zur Bagatellgrenze, der den Betrag als „XX Euro"
        # offen lässt, kann die Zahl 1000 nicht stützen — und eine Frist „bis zum XXX" kein
        # Datum.
        #
        # In der Messung vom 25.09.2026 waren das VIER der neun nicht tragenden Belege — die
        # größte einzelne Gruppe, und die einzige, die sich ohne Abwägung erkennen lässt.
        #
        # Verworfen wird nur der BELEG, nicht der Wert: der Wert kann aus der Eingabe gedeckt
        # und völlig richtig sein. Ihm fehlt dann nur die zusätzliche Verankerung, und keine
        # Angabe ist besser als eine, die ins Leere zeigt.
        befunde.append(f"{feld['id']}: Belegzitat enthält noch einen Platzhalter der "
                       f"Vorlage — {str(v['belegzitat'])[:120]!r}")
        v["belegzitat"] = None
        v["beleg_geprueft"] = False
    elif v.get("belegzitat"):
        v["beleg_geprueft"] = True
    return befunde


# Was gilt, wenn die Angabe ein Feld nicht deckt — je nach Einstiegspunkt verschieden.
#
# Im GESPRÄCH ist Schweigen eine Auskunft: die Bearbeiterin wurde gerade gefragt und hat
# nichts dazu gesagt. Ein abgeleiteter Wert wäre dort eine Unterstellung.
#
# Beim KNOPF im Formular ist es umgekehrt. Sie drückt ihn, weil sie etwas vorgelegt bekommen
# will — und für die Bausteine 6 bis 10 hat die Musterrichtlinie meist eine Antwort. Ohne
# Regelfall lieferte der Knopf für Baustein 7 ein Feld von sechs (Durchlauf vom 24.09.2026),
# und das eine war ausgerechnet ein ungedeckter Wert, den das Modell entgegen der Regel doch
# abgeleitet hatte.
_OHNE_REGELFALL = (
    'Dann ist der Wert genau "[Unklar]" und die Konfidenz höchstens 0.3. Rate nicht, und '
    "leite auch nichts aus dem Regelfall ab. Eine fehlende Angabe ist eine Auskunft, keine "
    "Lücke."
)

_MIT_REGELFALL = (
    "Dann leite den Wert aus dem REGELFALL der Musterbausteine ab, wenn diese dazu etwas "
    "hergeben, und setze \"deckung\" auf null. Das ist hier ausdrücklich erwünscht: die "
    "Bearbeiterin hat um einen Vorschlag gebeten und bekommt ihn als solchen ausgewiesen.\n\n"
    'Geben die Musterbausteine nichts her, ist der Wert genau "[Unklar]". Erfinde nichts — '
    "ein abgeleiteter Wert steht im Musterbaustein, ein erfundener nirgends."
)


# Was im Prompt steht, wenn die Bearbeiterin noch nichts gesagt hat.
#
# Eine leere Stelle im Prompt liest sich wie ein Fehler; dieser Satz sagt, dass es keiner
# ist. Gebraucht wird er beim Knopf „Vorschlag holen" auf einem frischen Entwurf — dort
# trägt allein der Regelfall.
_KEINE_EINGABE = "(Die Bearbeiterin hat zu diesem Abschnitt noch nichts angegeben.)"


def vorschlagen(abschnitt_nr, eingabe, felder, top_k=TOP_K, nur_landesrecht=True,
                konsens=False, mit_belegen=True, abfrageart=None, ohne_dateien=None,
                nachbarfelder=None, regelfall=False, entschieden=None, suchtext=None,
                abschnittsbindung=None, profil=None, suchkontext=None, feldbindung=None):
    """Vorschläge je Zielfeld.

    felder: [{"id", "label", "kind", "options"?, "help"?}] — vom Aufrufer, siehe Modulkopf.
    konsens: den Vorschlag mehrfach holen und abstimmen, siehe `_abstimmen`. Dreifache
        Kosten, dafür eine gemessene Konfidenz statt der Selbstauskunft des Modells.
    mit_belegen: Fundstellen aus dem Korpus holen und in den Prompt geben.
    suchtext: womit im Korpus GESUCHT wird, falls das etwas anderes sein soll als `eingabe`.

        Die beiden fielen bis zum 06.10.2026 zusammen, und das war beim Knopf „Vorschlag
        holen" ein Fehler: dort gibt es keine frische Eingabe, also reichte die Oberfläche
        den GESAMTEN Chatverlauf durch. Als Eingabe ist er richtig — es sind die Angaben der
        Bearbeiterin, und die Deckung soll daraus zitiert werden. Als Suchanfrage ist er das
        Schlechteste, was man schicken kann: ein langer, thematisch gemischter Text trifft
        überall ein bisschen und nirgends genau. Im Durchlauf vom 24.09.2026 kam so der
        Richtlinien-TITEL als Deckung für die Bewilligungsbehörde heraus.

        Ohne Angabe bleibt alles wie bisher — der Chat-Weg hat eine echte Eingabe und
        braucht die Trennung nicht.
    abfrageart: Sorte der Abfrage nach dem Prozessmodell, siehe `ABFRAGEARTEN`. Schränkt den
        sichtbaren Korpusausschnitt ein und steht im Nachweis, damit die Oberfläche einen
        Vorschlag nicht wie einen Fund darstellt.
    abschnittsbindung: nur Fundstellen aus demselben Baustein. Ohne Angabe gilt
        `config.ABSCHNITTSBINDUNG`; der Schalter ist da, um beide Seiten zu messen.
    profil: die BESTÄTIGTEN Werte des Entwurfs als {Formularfeld: Wert}, für den Abgleich mit
        den Steckbriefen der Korpusrichtlinien — siehe `profilfilter`. Ohne Angabe oder bei zu
        wenig festgelegten Werten findet kein Abgleich statt und es wird im ganzen Korpus
        gesucht.

    Zu `mit_belegen`: die Suche kostet rund die Hälfte der Antwortzeit, und ob sie beim
    FORMULIEREN etwas beiträgt, ist offen. Der Wert entsteht aus Musterbaustein und
    Nutzereingabe — beide liegen ohne Suche vor. Die Belege liefern nur den Nachweis, und
    zweimal war ausgerechnet dieser Nachweis das Problem: das Modell übernahm Wortlaut aus
    einer fremden Richtlinie. Der Musterbaustein ist als Beleg oft der genauere, weil nach
    ihm formuliert wurde. Der Schalter ist da, um das zu messen statt zu glauben.

    Ergibt (vorschlaege, nachweis). `nachweis` trägt Fundstellen, Prompt-Kennungen und die
    Befunde der Nachprüfung — das, was der Prüfvermerk und die Fehlersuche brauchen.
    """
    # Zeiten je Abschnitt. Ein Aufruf dauert rund eine Minute, und ohne Aufschlüsselung
    # wäre jede Beschleunigung geraten — deshalb fest eingebaut, nicht nur zum Messen.
    uhr = {}
    t0 = time.monotonic()
    bausteine = rahmen(abschnitt_nr, nur_landesrecht)
    rahmen_txt = _rahmen_text(bausteine)
    uhr["musterbausteine"] = round(time.monotonic() - t0, 1)

    if abfrageart and abfrageart not in ABFRAGEARTEN:
        raise ValueError(f"Unbekannte Abfrageart {abfrageart!r}, "
                         f"bekannt sind {sorted(ABFRAGEARTEN)}")
    nur_arten = ABFRAGEARTEN.get(abfrageart)

    # Unsere Abschnittsnummer IST der Baustein — 0, 9 und 10 tragen keine Nummer und damit
    # auch keine Entsprechung im Korpus; dort bleibt die Suche ungebunden.
    bindung = ABSCHNITTSBINDUNG if abschnittsbindung is None else abschnittsbindung
    gebunden = bindung and 1 <= (abschnitt_nr or 0) <= 8
    nur_baustein = abschnitt_nr if gebunden else None

    # Titel, Anlagen und Schlussformel (0, 9, 10) tragen in keiner Richtlinie eine Nummer.
    # Ohne Baustein greift die Bindung nicht, und ohne sie gewinnt der Allerweltssatz: Zu
    # „Weitere Inhalte" kam am 08.10.2026 zweimal derselbe Satz „Für die Bewilligung,
    # Auszahlung und Abrechnung … gelten die VV zu § 44 LHO" — er steht fast wortgleich in
    # jeder Landesrichtlinie, enthält das ganze Vokabular und sagt nichts.
    #
    # Für diese drei Abschnitte gibt es im Korpus keine Entsprechung. Gar keine Fundstelle ist
    # dort die richtige Antwort, und die Oberfläche sagt das inzwischen auch.
    if bindung and not gebunden:
        mit_belegen = False

    # Stufe 2: Nur Richtlinien, deren festgelegte Werte zum Entwurf passen. Greift erst, wenn
    # genug festgelegt ist — `passende_quellen` gibt sonst die leere Menge zurück, und die
    # bedeutet „kein Abgleich möglich", nicht „keine passt". Beides zu verwechseln hieße, bei
    # einem frischen Entwurf jede Fundstelle zu unterdrücken.
    quellen, profiltreffer = profilfilter.passende_quellen(profil or {})
    nur_quellen = sorted(quellen) or None

    # Stufe 3: je Zielfeld eine eigene Suche. Braucht den Kontext OHNE die Feldnamen — die
    # setzt `belege_je_feld` selbst davor. Fehlt er, bleibt es bei der gemeinsamen Anfrage.
    je_feld = (FELDBINDUNG if feldbindung is None else feldbindung) and suchkontext is not None

    suchzaehler = {}
    if mit_belegen and je_feld:
        bloecke, metas = belege_je_feld(
            felder, suchkontext, abschnitt_nr, uhr=uhr, zaehler=suchzaehler,
            nur_arten=nur_arten, ohne_dateien=ohne_dateien, nur_baustein=nur_baustein,
            nur_quellen=nur_quellen)
    elif mit_belegen:
        bloecke, metas = belege_holen(suchtext or eingabe, abschnitt_nr, top_k, uhr=uhr,
                                      nur_arten=nur_arten, ohne_dateien=ohne_dateien,
                                      zaehler=suchzaehler, nur_baustein=nur_baustein,
                                      nur_quellen=nur_quellen)
    else:
        bloecke, metas = [], []
    # Nach Zielfeld gruppiert, wenn je Feld gesucht wurde. Eine flache Liste zwänge das
    # Modell, für jedes Feld alle Stellen durchzugehen — und genau dabei greift es zur
    # erstbesten, die thematisch passt.
    belege = "\n\n".join(
        (f"[{b['fundstelle']}]"
         + (f" — zu „{b['feld_label']}“" if b.get("feld_label") else "")
         + f"\n{b.get('kurz') or b['roh']}")
        for b in bloecke)

    # Die Belegstellen sind Fremdtext im Prompt — dieselbe Absicherung wie in rag_query.
    # Ohne Belege steht dort nicht „keine Fundstellen" (das liest sich wie ein Fehlschlag der
    # Suche), sondern die Ansage, dass der Musterbaustein die Quelle ist. Sonst meldet das
    # Modell für jedes Feld eine fehlende Grundlage.
    leer_text = ("Für diesen Schritt werden keine Fundstellen herangezogen. Belege dich "
                 "ausschließlich auf die Musterbausteine.")
    sicher = sanitize_and_wrap(belege or leer_text,
                               tag_name="belege", max_length=50000).wrapped_content

    prompt = loader.load(
        "feldvorschlag",
        baustein_nr=abschnitt_nr,
        baustein_titel=(bausteine[0].get("titel") if bausteine and bausteine[0].get("titel")
                        else f"Abschnitt {abschnitt_nr}"),
        musterbausteine=rahmen_txt,
        eingabe=eingabe or _KEINE_EINGABE,
        belege=sicher,
        belege_rolle=_ROLLE_VORBILD if abfrageart == "vorschlagen" else _ROLLE_NACHWEIS,
        belege_ueberschrift=_UEBERSCHRIFT.get(abfrageart, _UEBERSCHRIFT[None]),
        felder=_felder_text(felder),
        # Die übrigen Felder desselben Abschnitts, nur mit Beschriftung.
        #
        # Ein Abschnitt wird in ZWEI Anfragen gefüllt, getrennt nach Abfrageart — das Modell
        # sieht hier also nicht alle seine Felder. Ohne diese Liste schrieb „Weitere
        # fachliche Nebenbestimmungen" die Prüfungsberechtigten als Fließtext hin, während
        # sie im selben Abschnitt längst als Auswahl standen.
        regelfall_regel=_MIT_REGELFALL if regelfall else _OHNE_REGELFALL,
        # Die schon bestätigten Werte desselben Abschnitts.
        #
        # Ohne sie wurde jedes Feld für sich geraten: „Antragsverfahren: mit Frist" stand
        # bestätigt im Entwurf, und die Antragsfrist kam trotzdem als „[Unklar]", weil das
        # Modell den Zusammenhang nicht sehen konnte.
        entschieden=(
            "BEREITS BESTÄTIGT IN DIESEM ABSCHNITT (Vorgabe, nicht zu ändern):\n"
            + "\n".join(f"- {e['label']}: {e['wert']}" for e in entschieden)
            if entschieden else ""
        ),
        nachbarfelder=(
            "WIRD AN ANDERER STELLE DIESES ABSCHNITTS ERFASST (nicht hier wiederholen):\n"
            + "\n".join(f"- {f.get('label') or f['id']}" for f in nachbarfelder)
            if nachbarfelder else ""
        ),
    )
    nachricht = [{"role": "system", "content": prompt.system},
                 {"role": "user", "content": prompt.user}]
    konsens_befunde = []
    t0 = time.monotonic()

    if konsens:
        # Cache aus, aber Temperatur 0 — abweichend von retrieval.py, und aus gemessenem
        # Grund. Dort steht die Temperatur über null, weil drei gleiche Anfragen sonst
        # dreimal dasselbe lieferten und es nichts abzustimmen gäbe. Hier streut gpt-oss-120b
        # schon bei Temperatur 0 von selbst (dreimal derselbe Fall, dreimal ein anderes
        # Ergebnis, immer dasselbe Modell). Zusätzliche Temperatur kauft also kein
        # zusätzliches Signal, sondern nur Rauschen — mit 0.3 fiel F-05 von 2/3 auf 1/3.
        #
        # Threads, weil litellm blockiert und der Rest des Backends synchron ist.
        def _lauf(_):
            try:
                roh, modell = chat(nachricht, temperature=KONSENS_TEMPERATUR_FELD,
                                   ohne_cache=True, mit_modell=True)
                return _antwort_lesen(roh), modell
            except Exception:
                return [], None
        with ThreadPoolExecutor(max_workers=KONSENS_LAEUFE) as pool:
            paare = list(pool.map(_lauf, range(KONSENS_LAEUFE)))
        laeufe_daten = [d for d, _ in paare]
        modelle = [m for _, m in paare if m]
        if not any(laeufe_daten):
            return [], {"fehler": "kein Lauf lieferte eine lesbare Antwort", "modelle": modelle}
        daten, konsens_befunde = _abstimmen(laeufe_daten, felder,
                                            KONSENS_LAEUFE, KONSENS_SCHWELLE)
    else:
        antwort, modell = chat(nachricht, temperature=0, mit_modell=True)
        modelle = [modell]
        daten = _antwort_lesen(antwort)
        if not daten:
            return [], {"fehler": "keine lesbare JSON-Antwort", "modelle": modelle,
                        "roh": (antwort or "")[:400]}

    uhr["vorschlag"] = round(time.monotonic() - t0, 1)
    uhr["gesamt"] = round(sum(uhr.values()), 1)

    nach_id = {f["id"]: f for f in felder}
    vorschlaege, befunde = [], list(konsens_befunde)
    # Auch die Beschriftung als Kennung zulassen.
    #
    # Das Modell antwortete für die Antragsauswahl mit `"selection: Antragsauswahl"` —
    # Kennung und Beschriftung zusammengeklebt, wie sie im Prompt untereinander stehen. Die
    # strenge Zuordnung verwarf das als unbekanntes Feld, und eine inhaltlich richtige
    # Antwort landete im Müll, weil die Schreibweise nicht stimmte.
    nach_label = {normalisieren(f.get("label") or "").lower(): f for f in felder}

    def feld_finden(kennung):
        k = str(kennung or "").strip()
        if k in nach_id:
            return nach_id[k], None
        # „selection: Antragsauswahl" oder „Antragsauswahl (selection)"
        for teil in re.split(r"\s*[:(\[]\s*", k):
            teil = teil.strip(" )]")
            if teil in nach_id:
                return nach_id[teil], f"Feldkennung erst nach Zerlegung lesbar ({k!r})"
            treffer = nach_label.get(normalisieren(teil).lower())
            if treffer:
                return treffer, f"Beschriftung statt Kennung geliefert ({k!r})"
        return None, None

    for v in daten:
        feld, hinweis = feld_finden(v.get("feld"))
        if hinweis:
            befunde.append(f"{feld['id']}: {hinweis}")
        if not feld:
            befunde.append(f"unbekanntes Feld verworfen: {v.get('feld')!r}")
            continue
        v["feld"] = feld["id"]
        befunde += _pruefen(v, feld, bloecke, rahmen_txt, eingabe, abfrageart)
        vorschlaege.append({
            "feld": feld["id"],
            "label": feld.get("label") or feld["id"],
            "wert": v.get("wert"),
            "status": v.get("status"),
            "quelle": v.get("quelle"),
            "musterbaustein": v.get("musterbaustein"),
            "fundstelle": bloecke[0]["fundstelle"] if bloecke else None,
            # Dateiname und Seite neben der fertigen Zitierform: nur damit lässt sich die
            # Fundstelle anklicken und das Quelldokument an der richtigen Stelle öffnen.
            # Aus der Zitierform zurückzurechnen ginge nicht — sie trägt den Kurznamen aus
            # dem Register, nicht den Dateinamen.
            "belegdatei": bloecke[0]["punkt"].payload.get("quelle") if bloecke else None,
            "belegseite": (bloecke[0]["punkt"].payload.get("seiten") or [None])[0]
                          if bloecke else None,
            "belegzitat": v.get("belegzitat"),
            "belegquelle": v.get("belegquelle"),
            "beleg_geprueft": v.get("beleg_geprueft"),
            "deckung": v.get("deckung") if v.get("gedeckt_durch_eingabe") else None,
            "begruendung": v.get("begruendung"),
            "konfidenz": v.get("konfidenz"),
        })

    befunde += _doppelte_werte_verwerfen(vorschlaege)

    fehlend = [f["id"] for f in felder if f["id"] not in {v["feld"] for v in vorschlaege}]
    if fehlend:
        befunde.append(f"ohne Vorschlag geblieben: {', '.join(fehlend)}")

    nachweis = {
        # Welches Modell geantwortet hat. Die Ausweichkette wechselt still, wenn der Cluster
        # ein Modell nicht bedient — und ein Wechsel verschiebt die Zahlen. Ohne diese Angabe
        # habe ich einen Umschlag von 2/3 auf 0/3 nicht erklären können.
        "modelle": modelle,
        "dauer_s": uhr,
        # Die Sorte der Abfrage gehört zum Nachweis und nicht nur in den Aufruf: an ihr
        # hängt, ob die Oberfläche eine Fundstelle als Rechtsgrundlage oder als Vorbild
        # aus einer fremden Richtlinie ausweisen muss.
        "abfrageart": abfrageart,
        # Der Holdout wirkt still; ohne diese Angabe ließe sich eine Messung gegen
        # einen Torso nicht von einer gegen den vollen Korpus unterscheiden.
        "ausgeblendete_dateien": (HOLDOUT_DATEIEN if ohne_dateien is None
                                  else list(ohne_dateien)),
        # Mit Datei und Seite, nicht nur als Text: Eine Fundstelle, die man nicht aufschlagen
        # kann, ist eine Behauptung. Nachprüfen kann sie sonst nur, wer den Datenordner kennt.
        "fundstellen": [{
            "text": b["fundstelle"],
            "datei": (b["punkt"].payload or {}).get("quelle"),
            "seite": ((b["punkt"].payload or {}).get("seiten") or [None])[0],
            "feld": b.get("feld"),
            "feld_label": b.get("feld_label"),
            # Die vom Satzfilter gewählten Sätze, nicht der ganze Block. Eine Fundstelle, von
            # der man nur die Adresse sieht, muss man aufschlagen, um sie zu verwerfen.
            "zitat": zitat_bilden(b.get("kurz") or b.get("roh")),
        } for b in bloecke],
        # Wonach Stufe 2 eingegrenzt hat. Ohne diese Angabe wäre ein mageres Ergebnis nicht
        # von einem leeren Korpus zu unterscheiden.
        "profilquellen": sorted(profiltreffer, key=lambda q: -profiltreffer[q]),
        # Der zusammengesetzte Belegtext, damit Aufrufer die Abschreibprüfung wiederholen
        # können, ohne Suche und Satzfilter ein zweites Mal laufen zu lassen — das kostet
        # sonst doppelt Zeit und doppelt Modellaufrufe (in der Feld-Eval beobachtet).
        "belegtext": " ".join(b.get("kurz") or b["roh"] for b in bloecke),
        "musterbausteine": [t["nummer"] for t in bausteine],
        "prompts": [f"{m.id}|{m.content_hash[:16]}" for m in metas] +
                   [f"{prompt.meta.id}|{prompt.meta.content_hash[:16]}"],
        "befunde": befunde,
    }
    # Mitschreiben, und zwar HIER statt in der HTTP-Naht.
    #
    # In `api.py` erfasste das Protokoll nur, was über den Dienst lief — die Eval-Läufe rufen
    # `vorschlagen` direkt auf und blieben damit unsichtbar. Ausgerechnet dort, wo man nach
    # einem Fehlschlag nachlesen will, stand nichts. An dieser Stelle gehen beide Wege durch.
    protokoll.schreibe(
        "vorschlag",
        abschnitt=abschnitt_nr,
        abfrageart=abfrageart,
        eingabe=eingabe,
        felder=[f["id"] for f in felder],
        werte=[{"feld": v["feld"], "wert": v["wert"], "status": v["status"],
                "gedeckt": bool(v.get("deckung")), "konfidenz": v.get("konfidenz")}
               for v in vorschlaege],
        befunde=befunde,
        dauer_s=uhr,
        modelle=modelle,
        # Wie viel die Suche brachte und wie viel davon unergiebig war. Siehe `belege_holen`:
        # das einzige Relevanzmaß, das ohne zusätzlichen Modellaufruf zu haben ist.
        suche=suchzaehler,
    )

    return vorschlaege, nachweis


def main():
    import argparse
    p = argparse.ArgumentParser(description="Feldvorschläge für einen Baustein (Probelauf).")
    p.add_argument("eingabe", help="Angabe des Fachreferats")
    p.add_argument("--abschnitt", type=int, default=1)
    p.add_argument("--felder", default="goal,purpose,legalBasis",
                   help="Feld-IDs, kommagetrennt (Probelauf: Beschriftungen werden geraten)")
    args = p.parse_args()

    # Nur für den Probelauf: im Betrieb kommen die Felder vom Aufrufer, mit Optionen.
    PROBE = {
        "goal": {"id": "goal", "label": "Förderziel", "kind": "textarea"},
        "purpose": {"id": "purpose", "label": "Zuwendungszweck", "kind": "textarea"},
        "legalBasis": {"id": "legalBasis", "label": "Rechtsgrundlage", "kind": "radio",
                       "options": [{"value": "lho44", "label": "Zuwendung nach § 44 LHO"},
                                   {"value": "lho53", "label": "Billigkeitsleistung nach § 53 LHO"},
                                   {"value": "administrative", "label": "Verwaltungsvorschriften"}]},
    }
    felder = [PROBE[i] for i in args.felder.split(",") if i in PROBE]

    vorschlaege, nachweis = vorschlagen(args.abschnitt, args.eingabe, felder)
    print(f"Eingabe: {args.eingabe}\n")
    for v in vorschlaege:
        print(f"{v['feld']:12} {str(v['status']):10} {str(v['quelle']):14} "
              f"MB {str(v['musterbaustein'] or '-'):6} K {v['konfidenz']}")
        print(f"             {str(v['wert'])[:96]!r}")
        if v.get("deckung"):
            print(f"             Deckung: {v['deckung'][:80]!r}")
        if v.get("belegzitat"):
            marke = "" if v.get("beleg_geprueft") else "  [NICHT GEDECKT]"
            print(f"             Beleg ({v.get('belegquelle') or '?'}): "
                  f"{v['belegzitat'][:75]!r}{marke}")
        else:
            print("             Beleg: KEINER")
    print(f"\nFundstellen: {len(nachweis.get('fundstellen', []))}")
    for b in nachweis.get("befunde", []):
        print(f"  ! {b}")


if __name__ == "__main__":
    main()
