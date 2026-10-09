"""Extraktionsartefakte aus dem bestehenden Index nehmen — ohne Neu-Einlesen.

Gemessen am 06.10.2026 über den laufenden Index: 25 Prozent aller Chunks trugen einen
weichen Trennstrich im Wort, 63 Prozent doppelte Leerzeichen. Für BM25 — die lexikalische
Hälfte der hybriden Suche — ist „wett­bewerblichen" kein Wort, sondern zwei Bruchstücke.
Betroffen sind vor allem die EU-Verordnungen und die GAK-Förderbereiche, also genau die
Dokumente, in denen die Retrieval-Messung ihre Pflicht-Fundstellen am häufigsten verfehlt.

Warum ein eigener Lauf statt `ingest.py --recreate`: Das Einlesen schickt jedes Dokument
durch docling, und das dauert Stunden. Der Chunk-TEXT liegt aber schon in der Payload. Zu
säubern und neu einzubetten genügt — dieselbe Reinigung wie beim Einlesen, aus `ingest`
importiert, damit beide Wege nicht auseinanderlaufen.

    python src/text_nachbessern.py --probe   # zeigen, was sich ändern würde
    python src/text_nachbessern.py           # säubern und neu einbetten

Die Vektoren MÜSSEN mit: ein gesäuberter Text mit altem Vektor wäre schlimmer als beides
alt — die Suche fände dann etwas anderes, als sie anzeigt.
"""
import argparse

from qdrant_client import QdrantClient, models

from ingest import saeubern, embed_batch
from sparse import sparse_many
from config import QDRANT_URL, COLLECTION

STAPEL = 64


def alle_punkte(client, collection):
    punkte, versatz = [], None
    while True:
        teil, versatz = client.scroll(collection, limit=1000, offset=versatz,
                                      with_payload=True, with_vectors=False)
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
    print(f"{len(punkte)} Chunks im Index.")

    zu_tun = []
    for pt in punkte:
        alt = (pt.payload or {}).get("text") or ""
        neu = saeubern(alt)
        if neu != alt:
            zu_tun.append((pt.id, alt, neu))

    print(f"{len(zu_tun)} Chunks ändern sich "
          f"({round(100 * len(zu_tun) / len(punkte)) if punkte else 0} %).")

    if zu_tun:
        print("\nDrei Beispiele:")
        for _, alt, neu in zu_tun[:3]:
            stelle = next((i for i, (x, y) in enumerate(zip(alt, neu)) if x != y), 0)
            print(f"  vorher: {alt[max(0, stelle - 30):stelle + 40]!r}")
            print(f"  nachher: {neu[max(0, stelle - 30):stelle + 40]!r}\n")

    if a.probe:
        print("Probelauf, nichts geschrieben.")
        return
    if not zu_tun:
        print("Nichts zu tun.")
        return

    print(f"Betten {len(zu_tun)} Chunks neu ein, in Stapeln zu {STAPEL} …")
    for i in range(0, len(zu_tun), STAPEL):
        teil = zu_tun[i:i + STAPEL]
        texte = [neu for _, _, neu in teil]

        # BEIDE Vektoren neu rechnen. Der dichte stammt vom Einbettungsmodell, der dünne von
        # fastembed — und der dünne ist der eigentliche Grund für diesen Lauf: BM25 zerlegt
        # „wett­bewerblichen" in zwei Bruchstücke, der dichte Vektor verkraftet das eher.
        # Einen von beiden zu erneuern wäre schlimmer als keinen: Suche und Anzeige
        # beschrieben dann verschiedene Texte.
        dicht = embed_batch(texte)
        duenn = sparse_many(texte)

        # `update_vectors` und `set_payload` statt `upsert`: Ein `upsert` mit PointStruct
        # ERSETZT die ganze Payload — Quelle, Seiten, Dokument, Nummer, Art und Status wären
        # weg. Beide Aufrufe hier rühren nur an, was sie benennen.
        client.update_vectors(
            collection_name=COLLECTION,
            points=[models.PointVectors(id=pid, vector={"dense": d, "bm25": s})
                    for (pid, _, _), d, s in zip(teil, dicht, duenn)],
        )
        for (pid, _, neu) in teil:
            client.set_payload(collection_name=COLLECTION, payload={"text": neu},
                               points=[pid])
        print(f"  {min(i + STAPEL, len(zu_tun))}/{len(zu_tun)}")
    print("Fertig. Jetzt eval.py erneut laufen lassen — "
          "Ausgangswert vom 06.10.2026: Recall 76 %, vollständig 74 %, MRR 0,60.")


if __name__ == "__main__":
    main()
