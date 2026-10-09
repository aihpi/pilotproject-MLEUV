"""Den Baustein unserer Struktur auf jeden Chunk schreiben.

Der Index trägt heute die EIGENE Gliederungsnummer jedes Dokuments — „5.4", „6.4", „D.4.1".
Zum Filtern taugt sie nicht: Dieselbe Regelung steht in einer Richtlinie unter 5.4, in einer
anderen unter 6.4. Ein eigenes Feld mit den nummerierten Bausteinen 1 bis 8 normalisiert das,
wird einmal berechnet und macht die Suchbedingung trivial.

Zwei Regeln, in dieser Reihenfolge:

    1. Was die Überschrift benennt. „8.4 Verwendungsnachweisverfahren" gehört zum Verfahren,
       gleich unter welcher Ziffer es steht.
    2. Sonst die führende Ziffer. Sie trifft gemessen in 91 % der Fälle zu, weil die meisten
       Richtlinien der Gliederung der VV zu § 44 LHO folgen.

Nur Richtlinien und Muster: Im GAK-Rahmenplan, im EU-Beihilferecht und in den ANBest zählt
eine „1" etwas anderes als bei uns. Ihre Chunks bleiben ohne Baustein und damit außerhalb der
abschnittsgebundenen Suche.

    python src/bausteine_schreiben.py --probe
    python src/bausteine_schreiben.py

Kein Neu-Einlesen und kein Neu-Einbetten: `set_payload` ergänzt ein Feld an vorhandenen
Punkten.
"""
import argparse
import collections
import re

from qdrant_client import QdrantClient

from config import QDRANT_URL, COLLECTION

# Dokumentarten, deren Gliederung unserer entspricht.
ARTEN = {"richtlinie", "muster"}

# Die nummerierten Bausteine. 0, 9 und 10 tragen in keiner Richtlinie eine Nummer.
HOECHSTER = 8

# Woran eine Überschrift ihren Baustein verrät. Die Wendungen stammen aus den Überschriften
# des Korpus; Reihenfolge entscheidet, das erste Treffen zählt.
UEBERSCHRIFT = {
    2: ["gegenstand der förderung", "gegenstand der zuwendung", "gegenstand der billigkeit",
        "fördergegenstand", "förderfähige maßnahm"],
    3: ["zuwendungsempfäng", "zuwendungsempfangende", "begünstigte", "antragsberechtigt"],
    4: ["zuwendungsvoraussetzung", "fördervoraussetzung", "voraussetzung"],
    5: ["art und umfang", "art, umfang", "art und höhe", "art, höhe", "umfang, höhe",
        "höhe der zuwendung", "höhe der billigkeit", "bemessungsgrundlage"],
    6: ["sonstige zuwendungsbestimmung", "sonstige bestimmung", "nebenbestimmung"],
    7: ["verfahren", "antragstellung", "bewilligung", "auszahlung", "verwendungsnachweis"],
    8: ["geltungsdauer", "inkrafttreten", "außerkrafttreten"],
    1: ["zuwendungszweck", "rechtsgrundlage", "zweck der", "ziel der", "förderziel"],
}


def aus_ueberschrift(abschnitt):
    """Welchen Baustein die Überschrift benennt, oder None."""
    text = (abschnitt or "").lower()
    # Die eigene Gliederungsnummer am Anfang stört die Stichwortsuche nicht, aber der Titel
    # des Dokuments täte es — Überschriften unter 8 Zeichen tragen nichts.
    if len(text) < 8:
        return None
    for baustein, wendungen in UEBERSCHRIFT.items():
        if any(w in text for w in wendungen):
            return baustein
    return None


def aus_nummer(nummer):
    """Führende Ziffer der Gliederungsnummer, sofern sie in unseren Bereich fällt."""
    m = re.match(r"(\d+)", str(nummer or ""))
    if not m:
        return None
    n = int(m.group(1))
    return n if 1 <= n <= HOECHSTER else None


def baustein_von(payload):
    if (payload or {}).get("art") not in ARTEN:
        return None
    return (aus_ueberschrift(payload.get("abschnitt"))
            or aus_nummer(payload.get("nummer")))


def alle_punkte(client, collection):
    punkte, versatz = [], None
    while True:
        teil, versatz = client.scroll(collection, limit=1000, offset=versatz,
                                      with_payload=["nummer", "art", "abschnitt", "quelle"],
                                      with_vectors=False)
        punkte += teil
        if versatz is None:
            return punkte


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--probe", action="store_true", help="nur zeigen, nichts schreiben")
    a = p.parse_args()

    client = QdrantClient(url=QDRANT_URL)
    punkte = alle_punkte(client, COLLECTION)
    infrage = [pt for pt in punkte if (pt.payload or {}).get("art") in ARTEN]
    zuordnung = {}
    for pt in infrage:
        b = baustein_von(pt.payload or {})
        if b is not None:
            zuordnung[pt.id] = b

    verteilung = collections.Counter(zuordnung.values())
    quellen = collections.defaultdict(set)
    for pt in infrage:
        b = zuordnung.get(pt.id)
        if b is not None:
            quellen[b].add((pt.payload or {}).get("quelle"))
    print(f"{len(punkte)} Chunks, davon {len(infrage)} aus {'/'.join(sorted(ARTEN))}, "
          f"davon {len(zuordnung)} zugeordnet "
          f"({round(100 * len(zuordnung) / len(infrage)) if infrage else 0} %).\n")
    for b in sorted(verteilung):
        print(f"  Baustein {b}: {verteilung[b]:>4} Chunks aus {len(quellen[b]):>2} Dokumenten")

    if a.probe:
        print("\nProbelauf, nichts geschrieben.")
        return

    nach_baustein = collections.defaultdict(list)
    for pid, b in zuordnung.items():
        nach_baustein[b].append(pid)
    for b, ids in sorted(nach_baustein.items()):
        client.set_payload(collection_name=COLLECTION, payload={"baustein": b}, points=ids)
        print(f"  Baustein {b}: {len(ids)} Chunks geschrieben")
    print("\nFertig.")


if __name__ == "__main__":
    main()
