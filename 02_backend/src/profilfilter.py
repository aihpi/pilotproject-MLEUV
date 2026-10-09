"""Welche Korpusrichtlinien zum Entwurf passen — Stufe 2 der Suche.

Die Abschnittsbindung (Stufe 1) sagt, welche FRAGE eine Fundstelle beantwortet. Sie sagt
nicht, ob die ANTWORT zum Fall passt: Eine Stelle aus Baustein 5 einer Richtlinie mit
Festbetragsfinanzierung steht im richtigen Abschnitt und hilft bei Anteilfinanzierung
trotzdem nicht. Gemessen am 08.10.2026: Die Abschnittsbindung tauschte 43 von 66 Fundstellen
aus und bewegte die Brauchbarkeit um 4 Punkte — innerhalb der Streuung des Verfahrens.

Hier wird deshalb am STECKBRIEF abgeglichen: Nur Richtlinien, deren bereits festgelegte Werte
mit denen des Entwurfs zusammengehen, kommen als Vergleichsfall in Frage. Findet sich keine,
bleibt die Mustervorlage — ein Vergleich mit einem Fall, der anders liegt, ist kein Vergleich.

Was NICHT abgeglichen wird:

    Fördersatz, Höchstbetrag, Bagatellgrenze. Es sind Zahlen, und Zahlenübereinstimmung ist
    kein Übereinstimmungskriterium, sondern das, was die Bearbeiterin erst sucht.

    Antragsverfahren. Der Steckbrief führt dort Frist/Windhund/digital, das Formular
    Ein-/Zwei-/Dreistufigkeit. Zwei verschiedene Fragen unter einem Namen.

Fehlt ein Feld im Steckbrief, schließt das die Richtlinie NICHT aus. Es heißt nur, dass es
nicht eindeutig auslesbar war; eine Lücke als Widerspruch zu werten würde den Korpus auf die
gut lesbaren Dokumente eindampfen.
"""
import os

import yaml

from config import BASE

ZIEL = os.path.join(BASE, "korpusprofile_lokal.yaml")

# Formularfeld → Feld des Steckbriefs. Nur Felder, bei denen beide Seiten dasselbe meinen.
FELDER = {
    "legalBasis": "rechtsgrundlage",
    "financingType": "finanzierungsart",
    "financingForm": "finanzierungsform",
    "recipients": "empfaengerkreis",
    "payment": "auszahlung",
    "eligibleBasis": "bemessungsgrundlage",
}

# Wo die Kennungen auseinandergehen. Das Formular unterscheidet bei der Bemessungsgrundlage
# feiner als der Steckbrief, der aus dem Fließtext liest: „Spitzabrechnung mit Gemeinkosten"
# steht in keiner Richtlinie als Begriff, die Spitzabrechnung schon.
WERTE = {
    "bemessungsgrundlage": {
        "actual": {"actual"},
        "actual-overhead": {"actual"},
        "fixed": {"amounts"},
        "fixed-rest": {"amounts", "lumpsum"},
        "fixed-overhead": {"amounts", "lumpsum"},
    },
}

# Ab wie vielen übereinstimmenden Feldern eine Richtlinie als Vergleichsfall taugt. Bei einem
# einzigen Feld — etwa nur „§ 44 LHO" — ist die Übereinstimmung bedeutungslos: 43 von 44
# Richtlinien stehen auf § 44 LHO.
MINDESTENS = 2


def laden(pfad=ZIEL):
    """Die Steckbriefe. Fehlt die Datei, gibt es keinen Abgleich — kein Fehler.

    Sie ist erzeugt und nicht im Repo (die Dateinamen benennen nicht zu veröffentlichende
    Dokumente). Ein frischer Klon hat sie nicht, und die Suche muss trotzdem laufen.
    """
    try:
        with open(pfad, encoding="utf-8") as f:
            return (yaml.safe_load(f) or {}).get("profile") or {}
    except OSError:
        return {}


def _werte(feld, roh):
    """Die Werte eines Formularfelds als Kennungen des Steckbriefs."""
    liste = roh if isinstance(roh, (list, tuple, set)) else [roh]
    umschrift = WERTE.get(feld) or {}
    ergebnis = set()
    for w in liste:
        if w in (None, ""):
            continue
        ergebnis |= umschrift.get(str(w), {str(w)})
    return ergebnis


def passende_quellen(entwurf, profile=None, mindestens=MINDESTENS):
    """Welche Richtlinien zum Entwurf passen. Ergibt (quellen, treffer_je_quelle).

    `entwurf`: {Formularfeld: Wert oder Werteliste} — nur BESTÄTIGTE Werte gehören hinein.

    Eine Richtlinie fällt heraus, sobald sie bei einem Feld etwas anderes festgelegt hat als
    der Entwurf. Bei Mehrfachfeldern wie dem Empfängerkreis genügt eine Überschneidung: Wer
    Kommunen UND Vereine fördert, kann von einer reinen Vereinsrichtlinie lernen.
    """
    profile = laden() if profile is None else profile
    gesucht = {steckbrief: _werte(steckbrief, entwurf.get(formular))
               for formular, steckbrief in FELDER.items()
               if entwurf.get(formular) not in (None, "", [], {})}
    gesucht = {k: v for k, v in gesucht.items() if v}
    if not gesucht:
        return set(), {}

    quellen, treffer = set(), {}
    for quelle, profil in profile.items():
        passend = 0
        for feld, werte in gesucht.items():
            haben = set(str(x) for x in (profil.get(feld) or []))
            if not haben:
                continue
            if haben & werte:
                passend += 1
            else:
                passend = -1
                break
        if passend >= mindestens:
            quellen.add(quelle)
            treffer[quelle] = passend
    return quellen, treffer


def beschreiben(entwurf, profile=None):
    """Einzeiler fürs Protokoll: wonach abgeglichen wurde und was übrig blieb."""
    profile = laden() if profile is None else profile
    quellen, _ = passende_quellen(entwurf, profile)
    felder = [f for f in FELDER if entwurf.get(f) not in (None, "", [], {})]
    return (f"Profilabgleich über {len(felder)} Feld(er) {felder}: "
            f"{len(quellen)} von {len(profile)} Richtlinien passen")
