"""Feldvorschläge für einen Baustein: aus Nutzereingabe wird ein Wert je Formularfeld.

Das ist die Naht zum Frontend. Arvids Chat-Endpunkt gibt heute die Eingabe unverändert in
jedes Zielfeld zurück; hier entsteht der echte Vorschlag — mit Musterbaustein-Bezug,
Belegzitat und Konfidenz.

Die Zielfelder kommen vom Aufrufer, nicht aus diesem Modul. Sie stehen in Arvids
`packages/shared` (Feldliste, Typ, Optionen), und die Frontend-Seite entscheidet über
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

import satzfilter
import musterbausteine
from anfrage import suche
from rag_query import bloecke_bilden
from llm import chat
from config import (BASE, TOP_K, KONSENS_LAEUFE, KONSENS_SCHWELLE,
                    KONSENS_TEMPERATUR_FELD, HOLDOUT_DATEIEN)

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
# streift, ist Landesrecht — und über den ganzen Text gesucht fiel genau der heraus: an 8.1
# („Die Richtlinie tritt mit Wirkung zum XXX in Kraft …") klebt die Überschrift des folgenden
# Abschnitts, ein Artefakt der Zeilenzusammenführung. Damit war Baustein 8 komplett leer.
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
        block = f"[Musterbaustein {t['nummer']}]\n{t['text']}"
        if t.get("hinweis"):
            block += f"\nHinweis an den Ersteller: {t['hinweis']}"
        teile.append(block)
    return "\n\n".join(teile)


def _felder_text(felder):
    zeilen = []
    for f in felder:
        zeile = f"- {f['id']}: {f.get('label') or f['id']}"
        if f.get("options"):
            werte = ", ".join(o["value"] for o in f["options"])
            zeile += f"\n    Auswahlfeld, genau einer dieser Werte: {werte}"
        elif f.get("kind") in ("number", "date"):
            zeile += f"\n    Typ: {f['kind']}"
        if f.get("help"):
            zeile += f"\n    Hinweis: {f['help']}"
        zeilen.append(zeile)
    return "\n".join(zeilen)


# Die Sorten von Abfragen aus dem Prozessmodell, mit dem Korpusausschnitt, den sie sehen.
#
# Nur die Sorte „vorschlagen" steht hier, weil nur für sie das Modell einen allgemeinen
# Filter nennt — und zwar dreimal wörtlich: „Prompt generieren Dokumente: Nur alte RL des
# Landes/GAK als Hilfestellung (auch bei nicht GAK-RL)". Für die Sorten „übernehmen" und
# „belegen" benennt das Modell jeweils ein bestimmtes Dokument, keinen Ausschnitt nach Art;
# die bekommen ihren Filter deshalb vom Aufrufer und keinen Namen hier.
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


def belege_holen(eingabe, abschnitt_nr, top_k=TOP_K, uhr=None, nur_arten=None,
                 ohne_dateien=None):
    """Belegstellen zum Anliegen: Hybrid-Suche, dann Satzfilter. Nur Nachweis, keine Werte.

    `uhr`: optionales Wörterbuch, in das die Teilzeiten geschrieben werden. Die beiden
    Schritte sind sehr verschieden teuer — die Suche stellt mehrere Teilanfragen mit je einem
    Embedding-Aufruf, der Satzfilter ruft das Modell je Stapel. Wer beschleunigen will, muss
    wissen, welcher von beiden es ist.
    """
    t0 = time.monotonic()
    treffer = suche(eingabe, abschnitt_nr=abschnitt_nr, top_k=top_k,
                    nur_arten=nur_arten, ohne_dateien=ohne_dateien)
    bloecke = bloecke_bilden(treffer)
    if uhr is not None:
        uhr["belege_suche"] = round(time.monotonic() - t0, 1)
    if not bloecke:
        return [], []

    t0 = time.monotonic()
    bloecke, metas = satzfilter.filtern(eingabe, bloecke)
    if uhr is not None:
        uhr["belege_satzfilter"] = round(time.monotonic() - t0, 1)
    # Ein Block ohne gewählten Satz belegt nichts und fliegt raus — wie in rag_query.
    bloecke = [b for b in bloecke if not (b["gefiltert"] and not b["indizes"])]
    return bloecke, metas


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

    if unklar:
        v["wert"] = UNKLAR
        v["status"] = "unklar"
        v["konfidenz"] = min(float(v.get("konfidenz") or 0.0), 0.3)
        return befunde

    if feld.get("options"):
        erlaubt = {normalisieren(o["value"]): o["value"] for o in feld["options"]}
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
    elif feld.get("options") and ungedeckt:
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

    if v.get("belegzitat") and not _beleg_gedeckt(v["belegzitat"], bloecke, rahmen_text):
        # Wortlaut mitgeben: ohne ihn ist nicht zu unterscheiden, ob das Modell erfunden hat
        # oder aus einer anderen zulässigen Quelle zitiert.
        befunde.append(f"{feld['id']}: Belegzitat steht so nicht in den Fundstellen — "
                       f"{str(v['belegzitat'])[:120]!r}")
        v["belegzitat"] = None
        v["beleg_geprueft"] = False
    elif v.get("belegzitat"):
        v["beleg_geprueft"] = True
    return befunde


def vorschlagen(abschnitt_nr, eingabe, felder, top_k=TOP_K, nur_landesrecht=True,
                konsens=False, mit_belegen=True, abfrageart=None, ohne_dateien=None):
    """Vorschläge je Zielfeld.

    felder: [{"id", "label", "kind", "options"?, "help"?}] — vom Aufrufer, siehe Modulkopf.
    konsens: den Vorschlag mehrfach holen und abstimmen, siehe `_abstimmen`. Dreifache
        Kosten, dafür eine gemessene Konfidenz statt der Selbstauskunft des Modells.
    mit_belegen: Fundstellen aus dem Korpus holen und in den Prompt geben.
    abfrageart: Sorte der Abfrage nach dem Prozessmodell, siehe `ABFRAGEARTEN`. Schränkt den
        sichtbaren Korpusausschnitt ein und steht im Nachweis, damit die Oberfläche einen
        Vorschlag nicht wie einen Fund darstellt.

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

    if mit_belegen:
        bloecke, metas = belege_holen(eingabe, abschnitt_nr, top_k, uhr=uhr,
                                      nur_arten=nur_arten, ohne_dateien=ohne_dateien)
    else:
        bloecke, metas = [], []
    belege = "\n\n".join(
        f"[{b['fundstelle']}]\n{b.get('kurz') or b['roh']}" for b in bloecke)

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
        eingabe=eingabe,
        belege=sicher,
        belege_rolle=_ROLLE_VORBILD if abfrageart == "vorschlagen" else _ROLLE_NACHWEIS,
        belege_ueberschrift=_UEBERSCHRIFT.get(abfrageart, _UEBERSCHRIFT[None]),
        felder=_felder_text(felder),
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
    for v in daten:
        feld = nach_id.get(v.get("feld"))
        if not feld:
            befunde.append(f"unbekanntes Feld verworfen: {v.get('feld')!r}")
            continue
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
        "fundstellen": [b["fundstelle"] for b in bloecke],
        # Der zusammengesetzte Belegtext, damit Aufrufer die Abschreibprüfung wiederholen
        # können, ohne Suche und Satzfilter ein zweites Mal laufen zu lassen — das kostet
        # sonst doppelt Zeit und doppelt Modellaufrufe (in der Feld-Eval beobachtet).
        "belegtext": " ".join(b.get("kurz") or b["roh"] for b in bloecke),
        "musterbausteine": [t["nummer"] for t in bausteine],
        "prompts": [f"{m.id}|{m.content_hash[:16]}" for m in metas] +
                   [f"{prompt.meta.id}|{prompt.meta.content_hash[:16]}"],
        "befunde": befunde,
    }
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
