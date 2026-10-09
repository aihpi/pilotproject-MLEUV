"""Woher darf ein Feldwert kommen? — gemessen am Musterbaustein.

Je Feld wird der passende Mustersatz der Vorlage als Bezugstext genommen und geprüft, wie
nah die Richtlinien des Korpus ihm kommen:

    VORLAGE    Die meisten Richtlinien folgen dem Mustersatz nahezu wörtlich. Der
               Satzrahmen genügt, eine Fundstelle bringt nichts Neues.
    VORBILD    Gleiche Regelungsart, abweichende Formulierung und Werte. Ein vergleichbarer
               Fall hilft beim Ausfüllen.
    EINZELFALL Kaum eine Richtlinie folgt dem Mustersatz. Aus dem Korpus ist nichts zu
               übernehmen.

Verglichen wird SATZWEISE gegen den Mustersatz, nicht blockweise untereinander: Ein Chunk
umfasst 900 Zeichen, von denen die Regelung wenige ausmacht — ein Blockvergleich misst die
Streuung des Umfelds statt die der Regelung.

    python src/feldklassen.py            # alle Felder
    python src/feldklassen.py --feld exclusions
"""
import argparse
import itertools
import os
import re

import json

import musterbausteine
import richtlinie
from anfrage import ABSCHNITT_THEMEN
from llm import embed
from retrieval import hybrid_search
from rag_query import bloecke_bilden
from config import BASE

FELDER = os.path.join(BASE, "eval", "felder.json")

# Mindestähnlichkeit zwischen Feldbeschriftung und Mustersatz, damit dieser als Bezugstext
# taugt. Darunter führt die Vorlage zu diesem Feld keinen Satz.
#
# Über die Einbettung statt über Wörter: „Prüfberechtigte Stellen" und „sind berechtigt zu
# prüfen" teilen keinen Wortanfang, „Inventarisierungspflicht" und „inventarisieren" nur den
# Stamm. Welcher Satz zu welchem Feld gehört, ist eine Bedeutungsfrage.
# An beobachteten Werten geeicht: ein zugehöriger Mustersatz liegt bei 0,39 bis 0,50 und
# deutlich vor dem nächsten. „Allgemeine Nebenbestimmungen" erreicht 0,25 bei 0,24 für den
# zweiten — kein Vorsprung, kein zugehöriger Satz.
BEZUG_MINDESTENS = 0.33
BEZUG_VORSPRUNG = 0.05

# Wie viele Stellen je Feld eingesammelt werden.
STELLEN = 12

# Ab welcher Übereinstimmung ein Satz als „folgt dem Mustersatz" gilt.
FOLGT_AB = 0.35

# Anteil der Fundstellen, die dem Mustersatz folgen müssen, damit ein Feld als Vorlage gilt.
VORLAGE_ANTEIL = 0.4
# Darunter Vorbild, unterhalb dieser Schwelle Einzelfall.
VORBILD_ANTEIL = 0.15

# Mindestzahl verschiedener Richtlinien, damit eine Klassifikation trägt.
QUELLEN_MINDESTENS = 4


def felder_laden(pfad=FELDER):
    """Alle Formularfelder mit Beschriftung, Art und Abschnitt — erzeugt aus packages/shared."""
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def _woerter(text):
    return {w.lower() for w in re.findall(r"\w{5,}", text or "")}


def _kosinus(a, b):
    laenge = (sum(x * x for x in a) ** 0.5) * (sum(y * y for y in b) ** 0.5)
    return sum(x * y for x, y in zip(a, b)) / laenge if laenge else 0.0


def saetze(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if len(s.strip()) >= 40]


def naehe(text, bezug):
    """Wie nah kommt der ähnlichste Satz dieses Textes dem Bezugssatz? 0 bis 1."""
    b = _woerter(bezug)
    if not b:
        return 0.0
    werte = []
    for s in saetze(text) or [text]:
        w = _woerter(s)
        if w:
            werte.append(len(w & b) / len(w | b))
    return max(werte) if werte else 0.0


def bezugssatz(abschnitt_nr, label):
    """Der Mustersatz des Abschnitts, der am ehesten zu diesem Feld gehört."""
    bausteine = musterbausteine.laden().get(abschnitt_nr) or []
    kandidaten = [(b.get("text") or "").strip() for b in bausteine
                  if not richtlinie.ist_ueberschrift(b) and len(b.get("text") or "") >= 80]
    if not kandidaten or not label.strip():
        return None
    vektoren = embed([label] + kandidaten)
    ziel, saetze_v = vektoren[0], vektoren[1:]
    werte = sorted(((_kosinus(ziel, v), i) for i, v in enumerate(saetze_v)), reverse=True)
    bester, i = werte[0]
    zweiter = werte[1][0] if len(werte) > 1 else 0.0
    if bester < BEZUG_MINDESTENS or bester - zweiter < BEZUG_VORSPRUNG:
        return None
    return kandidaten[i]


def klasse_fuer(anteil):
    if anteil is None:
        return "unbestimmt"
    if anteil >= VORLAGE_ANTEIL:
        return "Vorlage"
    if anteil < VORBILD_ANTEIL:
        return "Einzelfall"
    return "Vorbild"


def stellen_sammeln(feld, abschnitt_nr=None):
    """Einschlägige Stellen aus den Richtlinien des Korpus. Ergibt (texte, quellen)."""
    anfrage = feld.get("label") or feld.get("id") or ""
    thema = (ABSCHNITT_THEMEN.get(abschnitt_nr) or [""])[0] if abschnitt_nr else ""
    treffer = hybrid_search(f"{anfrage}. {thema}".strip(), top_k=STELLEN, rerank=False,
                            nur_arten=["richtlinie"])
    bloecke = bloecke_bilden(treffer)
    texte = [(b.get("roh") or "")[:900] for b in bloecke]
    quellen = {(b["punkt"].payload or {}).get("quelle") for b in bloecke}
    return [t for t in texte if t.strip()], {q for q in quellen if q}


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--feld", help="nur dieses Feld")
    a = p.parse_args()

    felder = felder_laden()
    if a.feld:
        felder = {k: v for k, v in felder.items() if k == a.feld}

    print(f"{'Feld':<22} {'Abs':>3} {'Klasse':<12} {'folgt':>7} {'Quellen':>8}")
    print("-" * 58)
    for fid, feld in felder.items():
        nr = feld.get("abschnitt")
        bezug = bezugssatz(nr, feld.get("label") or fid) if nr else None
        texte, quellen = stellen_sammeln(feld, nr)
        if not bezug:
            k, anteil = "kein Mustersatz", None
        elif len(quellen) < QUELLEN_MINDESTENS:
            k, anteil = "zu wenig Material", None
        else:
            folgen = [t for t in texte if naehe(t, bezug) >= FOLGT_AB]
            anteil = len(folgen) / len(texte) if texte else 0.0
            k = klasse_fuer(anteil)
        print(f"{fid:<22} {str(nr or '—'):>3} {k:<12} "
              f"{(f'{anteil:.0%}' if anteil is not None else '—'):>7} {len(quellen):>8}")

    print(f"\nEin Fund gilt als dem Mustersatz folgend ab {FOLGT_AB:.0%} Übereinstimmung. "
          f"Vorlage ab {VORLAGE_ANTEIL:.0%} solcher Funde,\nEinzelfall unter "
          f"{VORBILD_ANTEIL:.0%}; mindestens {QUELLEN_MINDESTENS} verschiedene Richtlinien.")
    print("Gemessen wird die Übereinstimmung der Formulierungen, nicht ihre Richtigkeit.")


if __name__ == "__main__":
    main()
