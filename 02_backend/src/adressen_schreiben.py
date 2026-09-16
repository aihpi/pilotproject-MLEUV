"""Adressfelder auf den bestehenden Qdrant-Index schreiben (Bausteine a und b).

Kein Neu-Einlesen, kein Neu-Embedden: `set_payload` ergänzt Felder an vorhandenen Punkten.
Ein Lauf dauert Sekunden und lässt sich beliebig wiederholen.

    python src/adressen_schreiben.py            # schreiben
    python src/adressen_schreiben.py --probe    # nur zeigen, was geschrieben würde
"""
import argparse
from collections import defaultdict

from qdrant_client import QdrantClient, models

from adressierung import register, adressen
from config import QDRANT_URL, COLLECTION


def alle_punkte(client, collection):
    punkte, versatz = [], None
    while True:
        teil, versatz = client.scroll(collection, limit=1000, offset=versatz,
                                      with_payload=True, with_vectors=False)
        punkte += teil
        if versatz is None:
            return punkte


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--probe", action="store_true", help="nichts schreiben, nur berichten")
    args = p.parse_args()

    reg = register()
    if not reg:
        print(f"Kein Register gefunden — erwartet wird korpus_register.yaml")
        return

    client = QdrantClient(url=QDRANT_URL)
    punkte = alle_punkte(client, COLLECTION)
    print(f"{len(punkte)} Chunks im Index, {len(reg)} Dokumente im Register.")

    nach_datei = defaultdict(list)
    for pt in punkte:
        nach_datei[pt.payload.get("quelle")].append(pt)

    unbekannt = [q for q in nach_datei if q not in reg]
    if unbekannt:
        print(f"\nNICHT im Register ({len(unbekannt)}) — diese Chunks bleiben ohne Adresse:")
        for q in sorted(unbekannt):
            print(f"  {len(nach_datei[q]):5d}  {q}")

    gesamt = mit_nummer = vererbt = 0
    for datei, pts in sorted(nach_datei.items()):
        eintrag = reg.get(datei)
        if not eintrag:
            continue
        pts.sort(key=lambda x: x.payload.get("chunk_index", 0))
        felder = adressen([x.payload for x in pts], eintrag)

        for pt in pts:
            f = dict(felder.get(pt.payload.get("chunk_index"), {}))
            if not f:
                continue
            if eintrag.get("zitierweise") == "artikel":
                f["zitierweise"] = "artikel"
            # Die Dokumentart aus dem Register mitschreiben. Ohne sie im Payload lässt sich
            # der Korpus zur Laufzeit nicht nach Art einschränken — und genau das verlangt
            # das Prozessmodell für die Vorschlags-Abfragen: „Nur alte RL des Landes/GAK
            # als Hilfestellung". Das Register kannte die Art schon, sie stand nur nie im
            # Index.
            if eintrag.get("art"):
                f["art"] = eintrag["art"]
            gesamt += 1
            if f.get("nummer"):
                mit_nummer += 1
                if f.get("nummer_quelle") == "vererbt":
                    vererbt += 1
            if not args.probe:
                client.set_payload(collection_name=COLLECTION, payload=f, points=[pt.id])

    n = len(punkte)
    print(f"\n{'(Probe) ' if args.probe else ''}Adresse gesetzt: {gesamt} von {n} Chunks ({100*gesamt//max(n,1)} %)")
    print(f"  davon mit Nummer: {mit_nummer} ({100*mit_nummer//max(n,1)} % des Index), "
          f"davon vererbt: {vererbt}")
    print(f"  ohne Nummer: {gesamt - mit_nummer} — EU-Verordnungen (struktur_fehlt) und "
          f"Chunks vor der ersten Gliederungsnummer")


if __name__ == "__main__":
    main()
