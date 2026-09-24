"""Wie haben frühere Richtlinien dieselbe Abweichung begründet?

Das Prozessmodell führt dafür die Aufgabe „Vorformulierte Begründung abfragen". Gemeint ist
nicht, dass das Werkzeug die Begründung schreibt — die Unterschrift unter einem Anschreiben
ans MdFE leistet ein Mensch. Gemeint ist, dass es zeigt, wie andere es gemacht haben.

Der Unterschied ist der ganze Zweck dieses Moduls. Eine erzeugte Begründung liest sich fertig
und wird durchgewunken; eine fremde Begründung mit Fundstelle daneben liest sich als Vorbild
und lädt zum Vergleichen ein. Deshalb kommt hier KEIN Modell zum Einsatz: gesucht wird, und
was gefunden wird, geht unverändert und mit Quellenangabe zurück. Was nicht formuliert wird,
kann auch nicht danebenformuliert werden.

Die Suchanfrage entsteht aus dem Vermerkseintrag: der Rechtsstelle, der Regel und dem Wert,
der die Regel ausgelöst hat. Eine Bagatellgrenze von 1.000 Euro sucht also nach Stellen, an
denen eine Richtlinie eine Bagatellgrenze unterhalb der Regelgrenze begründet — nicht nach
„Bagatellgrenze" allgemein.

    from begruendung import vorbilder
    vorbilder("bagatellgrenze", "Ziff. 1.5 VV zu § 44 LHO", "1000")
"""
from anfrage import suche
from rag_query import bloecke_bilden
from config import HOLDOUT_DATEIEN

# Wie viele Vorbilder zurückgehen.
#
# Drei. Bei einem hat man keinen Vergleich, bei zehn liest niemand mehr — und der Zweck ist
# nicht Vollständigkeit, sondern ein Anhaltspunkt für einen Text, den ohnehin ein Mensch
# schreibt.
VORBILDER = 3

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


def vorbilder(regel, rechtsstelle=None, wert=None, top_k=VORBILDER, ohne_dateien=None):
    """Bis zu `top_k` Textstellen mit Fundstelle. Ohne Modell, ohne Umformulierung.

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
    treffer = suche(text, top_k=top_k * 3,
                    nur_arten=("richtlinie", "rahmenplan"),
                    ohne_dateien=HOLDOUT_DATEIEN if ohne_dateien is None else ohne_dateien)
    raus = []
    for b in bloecke_bilden(treffer)[:top_k]:
        payload = b["punkt"].payload
        raus.append({
            "fundstelle": b["fundstelle"],
            "text": (b["roh"] or "").strip(),
            "datei": payload.get("quelle"),
            "seite": (payload.get("seiten") or [None])[0],
        })
    return raus
