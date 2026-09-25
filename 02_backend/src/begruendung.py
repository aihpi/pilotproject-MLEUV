"""Wie ist dieselbe Abweichung in anderen Richtlinien geregelt?

Das Prozessmodell führt dafür „Vorformulierte Begründung abfragen". Beim ersten Durchlauf am
24.09.2026 zeigte sich, dass dieser Name mehr verspricht, als der Korpus hergibt:

**Richtlinien enthalten keine Begründungen.** Sie enthalten Regelungen. Die Begründung einer
Abweichung steht im Anschreiben ans MdFE, und solche Anschreiben liegen nicht im Korpus —
möglicherweise in den nicht indexierten Ordnern 05 und 06, das ist mit dem MLEUV zu klären.

Was dieses Modul deshalb liefert, ist etwas anderes und trotzdem brauchbar: **den
Präzedenzfall**. Auf die Frage nach 90 Prozent für Kommunen kam „bis zu 90 Prozent für
finanzschwache Gemeinden, definiert über das Haushaltssicherungskonzept, bestätigt durch die
Kommunalaufsicht" — keine fertige Begründung, aber ein anerkanntes Muster, an dem sich eine
eigene ausrichten lässt.

Hier wird NICHTS FORMULIERT: gesucht wird, ausgewählt wird, und was gefunden wird, geht
unverändert mit Quellenangabe zurück. Was nicht formuliert wird, kann auch nicht
danebenformuliert werden — und eine erzeugte Begründung läse sich fertig und würde
durchgewunken.

Ein Modell ist dabei, seit der Satzfilter am 24.09.2026 zurückkam, aber nur als AUSWÄHLENDES:
es entscheidet, welche Sätze eines Fundes zur Sache gehören, und schreibt keinen einzigen.
Vorher stand als „Vorbild" zum Fördersatz ein Hinweis an den Ersteller auf dem Bildschirm —
kein Modellaufruf, dafür ein wertloser Präzedenzfall.

    from begruendung import vorbilder
    vorbilder("bagatellgrenze", "Ziff. 1.5 VV zu § 44 LHO", "1000")
"""
import re

import satzfilter
from anfrage import suche
from rag_query import bloecke_bilden
from satzfilter import saetze_teilen, zusammensetzen
from config import HOLDOUT_DATEIEN

# Wie viele Vorbilder zurückgehen.
#
# Drei. Bei einem hat man keinen Vergleich, bei zehn liest niemand mehr — und der Zweck ist
# nicht Vollständigkeit, sondern ein Anhaltspunkt für einen Text, den ohnehin ein Mensch
# schreibt.
VORBILDER = 3

# Wie viele Sätze je Fundstelle stehen bleiben.
#
# Drei. Ein Block ist ein ganzer Gliederungspunkt und kann eine Seite lang sein — im ersten
# Versuch stand unter „So haben andere das geregelt" eine vollständige Seite
# Flurbereinigungsrichtlinie samt De-minimis-Belehrung. Wer das liest, liest es nicht.
SAETZE_JE_FUND = 3

# Worum es je Regel geht, in der Sprache der Richtlinien.
#
# Die Regelkennung allein („bagatellgrenze") findet nichts: so heißt es in keiner Richtlinie.
# Gesucht wird nach dem, was dort tatsächlich steht, wenn jemand diese Abweichung begründet.
_SUCHWORTE = {
    "bagatellgrenze":
        "Bagatellgrenze unterschritten geringere Zuwendung als Mindestbetrag Begründung",
    "vollfinanzierung":
        "Vollfinanzierung ohne eigenes wirtschaftliches Interesse der Zuwendungsempfangenden",
    "kommunaler_hoechstsatz":
        "Fördersatz über 80 Prozent für kommunale Zuwendungsempfangende Zustimmung",
    "geltungsdauer":
        "Geltungsdauer der Richtlinie länger als drei Jahre Begründung Verlängerung",
    "empfaengerkreis_gemischt":
        "Zuwendungsempfangende Kommunen und juristische Personen des privaten Rechts zugleich",
}


def anfrage_bilden(regel, rechtsstelle=None, wert=None):
    """Die Suchanfrage zu einem Vermerkseintrag.

    Die Regelkennung wird übersetzt, nicht durchgereicht: „bagatellgrenze" steht in keiner
    Richtlinie, „Bagatellgrenze unterschritten" schon. Ist eine Regel hier nicht eingetragen,
    bleibt die Kennung als Notbehelf — besser eine schlechte Anfrage als keine.
    """
    teile = [_SUCHWORTE.get(regel, str(regel or "").replace("_", " "))]
    if rechtsstelle:
        teile.append(str(rechtsstelle))
    if wert not in (None, ""):
        teile.append(str(wert))
    return " ".join(t for t in teile if t).strip()


# Wie dicht Tabellenzellen stehen dürfen, bevor ein Block als Artefakt gilt.
#
# Ein Block aus der Tabellenextraktion sieht so aus: „5.4.3.1, 1 = Nummer 2.1.1:. 5.4.3.1,
# 2 = . , 1 = bis zu 70 Prozent …" — rohe Zellen, jede doppelt, Gliederungsnummer davor.
# Lesbar ist das nicht, und kein Kürzen macht es lesbar. Drei solcher Muster in einem Block
# sind kein Zufall; ein Rechtstext enthält Gleichheitszeichen praktisch nie.
TABELLENRESTE = 3

_ZELLE = re.compile(r"(?:^|\s)[\d.]*,\s*\d\s*=")


def _tabellenrest(text):
    """Ist dieser Block ein Rest aus der Tabellenextraktion statt Fließtext?"""
    return len(_ZELLE.findall(text or "")) >= TABELLENRESTE


def _teilen(text):
    """In Sätze UND Aufzählungspunkte trennen.

    `saetze_teilen` trennt bei .!? — in den Richtlinien stehen die Regelungen aber als
    Aufzählung („- D.4.1 bis zu 75 Prozent …"). Eine ganze Liste zählte damit als ein Satz,
    und die Kürzung ließ die Seite stehen, die sie kürzen sollte.
    """
    teile = []
    for satz in saetze_teilen(text):
        # Vor „- " trennen, den Strich aber behalten: er trägt die Gliederungsnummer.
        stuecke = re.split(r"\s+(?=-\s+[A-Za-zÄÖÜ0-9])", satz)
        teile.extend(s.strip() for s in stuecke if s.strip())
    return teile


def _kuerzen(text, anfrage, hoechstens=SAETZE_JE_FUND):
    """Den Block auf die Sätze kürzen, die die Suchbegriffe tragen. Ohne Modell.

    Der Notbehelf, seit der Satzfilter zurück ist: er greift nur noch dort, wo dieser nichts
    geliefert hat — bei einem Ausfall oder einer Antwort, die sich nicht zuordnen ließ. Ein
    ausgefallener Filterlauf soll den Knopf nicht leer zurückgeben.

    Gewichtet wird nach Wortüberschneidung, in der ursprünglichen Reihenfolge, Lücken mit
    `(...)` gekennzeichnet wie überall im Werkzeug.
    """
    saetze = _teilen(text)
    if len(saetze) <= hoechstens:
        return text.strip()
    gesucht = {w.lower() for w in re.findall(r"\w{5,}", anfrage)}
    if not gesucht:
        return zusammensetzen(saetze, list(range(hoechstens)))
    bewertet = sorted(
        range(len(saetze)),
        key=lambda i: -len(gesucht & {w.lower() for w in re.findall(r"\w{5,}", saetze[i])}),
    )
    return zusammensetzen(saetze, sorted(bewertet[:hoechstens]))


def vorbilder(regel, rechtsstelle=None, wert=None, top_k=VORBILDER, ohne_dateien=None):
    """Bis zu `top_k` Textstellen mit Fundstelle. Unverändert, ohne Umformulierung.

    Ergibt [{fundstelle, text, datei, seite}]. Die Datei- und Seitenangabe macht die
    Fundstelle anklickbar — ohne sie wäre sie eine Behauptung, die nur nachprüfen kann, wer
    den Datenordner kennt.
    """
    text = anfrage_bilden(regel, rechtsstelle, wert)
    if not text:
        return []
    # Nur frühere Richtlinien und Rahmenpläne: die VV sagt, was zulässig ist, aber nicht, wie
    # man eine Abweichung begründet. Dieselbe Einschränkung wie bei der Abfragesorte
    # „vorschlagen" im Prozessmodell.
    # OHNE Reranking: für einen Präzedenzfall genügt die Trefferliste der Suche — es geht
    # nicht um die beste Stelle, sondern um drei zum Vergleichen.
    treffer = suche(text, top_k=top_k * 3, rerank=False,
                    nur_arten=("richtlinie", "rahmenplan"),
                    ohne_dateien=HOLDOUT_DATEIEN if ohne_dateien is None else ohne_dateien)
    bloecke = [b for b in bloecke_bilden(treffer)
               # Unlesbares gar nicht erst anbieten. Die Ursache liegt in der Aufbereitung
               # und gehört dort behoben — bis dahin ist ein Block weniger besser als ein
               # Block, den niemand lesen kann.
               if not _tabellenrest(b["roh"] or "")]
    if not bloecke:
        return []

    # Der Satzfilter, am 24.09.2026 zurückgeholt.
    #
    # Er war herausgenommen, damit der Knopf schnell bleibt und ohne Modellaufruf auskommt.
    # Der Preis dafür stand im Durchlauf desselben Tages auf dem Bildschirm: als „Vorbild" zum
    # Fördersatz erschien ein HINWEIS AN DEN ERSTELLER („Diese Angaben sind vor Bewilligung
    # eindeutig mit ja/nein zu beurteilen") — keine Regelung, und als Präzedenzfall wertlos.
    # Dies ist der ungefilterteste Weg im Werkzeug: keine Abschnittsnummer, kein Reranking,
    # nichts. Zehn Sekunden für drei brauchbare Stellen sind der bessere Handel als drei
    # sofortige, von denen eine in die Irre führt.
    #
    # Er ENTSCHEIDET nichts: er wählt Sätze aus, die schon dastehen. Der Wortlaut bleibt
    # unverändert, und damit bleibt auch das Versprechen dieses Knopfes gültig.
    gefiltert, _ = satzfilter.filtern(text, bloecke)
    raus = []
    for b in gefiltert:
        if len(raus) >= top_k:
            break
        # Ein Block, in dem der Filter keinen einschlägigen Satz gefunden hat, gehört nicht
        # zur Sache — dieselbe Regel wie in `vorschlag.belege_holen`.
        if b["gefiltert"] and not b["indizes"]:
            continue
        payload = b["punkt"].payload
        raus.append({
            "fundstelle": b["fundstelle"],
            # Der Filter hat schon gekürzt; `_kuerzen` greift nur, wo er nichts getan hat.
            "text": (b["kurz"] if b["gefiltert"] else _kuerzen(b["roh"] or "", text)).strip(),
            "datei": payload.get("quelle"),
            "seite": (payload.get("seiten") or [None])[0],
        })
    return raus
