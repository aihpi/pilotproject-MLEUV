"""Verweise über den Korpus ziehen und in Index und Tabelle schreiben (Baustein c).

Anders als die Adressierung braucht dieser Lauf das Modell — ein Aufruf je Stapel von bis zu
sechs Blöcken. Über 4.889 Chunks sind das grob 900 Aufrufe. Deshalb offline, deshalb wiederhol-
bar, und deshalb mit --dokument und --limit für Probeläufe.

    python src/verweise_schreiben.py --dokument ANBest-G          # ein Dokument
    python src/verweise_schreiben.py --limit 40                   # erste 40 Chunks
    python src/verweise_schreiben.py                              # alles
    python src/verweise_schreiben.py --tabelle-neu                # nur Tabelle neu bauen
"""
import argparse
import json
import os
from collections import defaultdict

from qdrant_client import QdrantClient

import verweise
from adressierung import abkuerzungen, register
from config import QDRANT_URL, COLLECTION, BASE

TABELLE = os.path.join(BASE, "data", "verweise.json")


def alle_punkte(client):
    punkte, versatz = [], None
    while True:
        teil, versatz = client.scroll(COLLECTION, limit=1000, offset=versatz,
                                      with_payload=True, with_vectors=False)
        punkte += teil
        if versatz is None:
            return punkte


def tabelle_schreiben(punkte):
    tab = verweise.tabelle(punkte)
    os.makedirs(os.path.dirname(TABELLE), exist_ok=True)
    with open(TABELLE, "w", encoding="utf-8") as f:
        json.dump(tab, f, ensure_ascii=False, indent=1)
    print(f"\nTabelle: {TABELLE}")
    print(f"  {len(tab['vorwaerts'])} adressierbare Stellen")
    print(f"  {len(tab['rueckwaerts'])} Stellen, auf die verwiesen wird")
    treffer = sum(1 for k in tab["rueckwaerts"] if k in tab["vorwaerts"])
    print(f"  davon im Korpus auflösbar: {treffer} "
          f"({100 * treffer // max(len(tab['rueckwaerts']), 1)} %)")
    return tab


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dokument", help="nur dieses Dokument (Kurzname aus dem Register)")
    p.add_argument("--limit", type=int, help="nur die ersten N Chunks (Probelauf)")
    p.add_argument("--tabelle-neu", action="store_true",
                   help="nichts extrahieren, nur die Tabelle aus vorhandenen Payloads bauen")
    args = p.parse_args()

    client = QdrantClient(url=QDRANT_URL)
    punkte = alle_punkte(client)

    if args.tabelle_neu:
        tabelle_schreiben(punkte)
        return

    zielnamen = abkuerzungen()
    reg = register()
    print(f"{len(punkte)} Chunks, {len(zielnamen)} zulässige Zielnamen aus dem Register.")

    nach_dokument = defaultdict(list)
    for pt in punkte:
        dok = pt.payload.get("dokument")
        if dok and (not args.dokument or dok == args.dokument):
            nach_dokument[dok].append(pt)

    if not nach_dokument:
        print("Nichts zu tun — ist die Adressierung geschrieben? (adressen_schreiben.py)")
        return

    gesamt = mit_treffer = extern = 0
    for dok, pts in sorted(nach_dokument.items()):
        pts.sort(key=lambda x: x.payload.get("chunk_index", 0))
        if args.limit:
            pts = pts[:args.limit]
        # Nummer des ersten Chunks als Kontext; der Prompt braucht sie nur für nackte Verweise,
        # und innerhalb eines Stapels liegen die Nummern ohnehin beieinander.
        bloecke = [{"id": str(x.payload.get("chunk_index")), "text": x.payload.get("text") or ""}
                   for x in pts]
        nummer = pts[0].payload.get("nummer") if pts else None
        gefunden, _ = verweise.finden(dok, nummer, bloecke, zielnamen)

        n_dok = 0
        for pt in pts:
            treffer = gefunden.get(str(pt.payload.get("chunk_index"))) or []
            gesamt += 1
            if treffer:
                mit_treffer += 1
                n_dok += len(treffer)
                extern += sum(1 for t in treffer if not t["im_korpus"] and not t["intern"])
            client.set_payload(collection_name=COLLECTION,
                               payload={"verweise": treffer}, points=[pt.id])
        print(f"  {dok}: {len(pts)} Chunks, {n_dok} Verweise")
        if args.limit and args.dokument:
            break

    print(f"\n{gesamt} Chunks bearbeitet, {mit_treffer} mit mindestens einem Verweis.")
    print(f"  Verweise aus dem Korpus hinaus: {extern} — die bleiben ohne Ziel, "
          f"und das ist die richtige Auskunft.")
    tabelle_schreiben(alle_punkte(client))


if __name__ == "__main__":
    main()
