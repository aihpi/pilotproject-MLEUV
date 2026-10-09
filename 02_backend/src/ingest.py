"""Robuste Ingestion: Dokumente -> docling -> Sub-Chunks -> dense+BM25 -> Qdrant.

Von Spark: HybridChunker (+ model_max_length-Trick), docling-OCR-Konfig.
Hybrid: jeder Sub-Chunk bekommt einen dense- (Qwen3-Embedding-8B) UND einen BM25-Sparse-Vektor.
Parent/Sub: embed klein (Sub), Payload trägt den größeren Eltern-Chunk (gleiche Überschrift)
für den LLM-Kontext -> Regel/Ausnahme über mehrere Absätze bleibt zusammen (ersetzt Overlap).
"""
import glob
import os
import re
import time
import unicodedata
import uuid

from qdrant_client import QdrantClient, models

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.chunking import HybridChunker
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from transformers import AutoTokenizer

from llm import embed
from sparse import sparse_many
from config import (QDRANT_URL, COLLECTION, CORPUS_DIR, MAX_DOCS, OCR_ENABLED,
                    CHUNK_TOKENIZER, EMBED_BATCH, RECREATE, CORPUS_PREFIXES, NUR_REGISTRIERT,
                    TEXTLAYER_MIN_ZEICHEN, TEXTLAYER_ANTEIL, PARENT_MAX_CHARS,
                    veraltete_dokumente)

DOC_GLOBS = ("*.pdf", "*.docx")

_EBENE = {"01": "Testcase", "03": "Bund", "04": "Land", "05": "Land", "06": "Land",
          "07": "Land", "08": "EU", "09": "Land", "10": "Bund", "11": "EU"}


def _prefix(path):
    m = re.search(r"/(0[1-9]|1[01]) ", path)
    return m.group(1) if m else None


def rechtsebene(path):
    return _EBENE.get(_prefix(path), "unbekannt")


def find_docs(root, limit):
    # Einzeldatei: nachgerüstet für Dokumente, die nicht in einem der numerierten Ordner
    # liegen (die Musterrichtlinie liegt unmittelbar im Datenordner). Ohne das müsste man
    # CORPUS_DIR auf den ganzen Datenordner richten und würde die vertraulichen Ordner
    # mitziehen — genau das soll nicht passieren.
    if os.path.isfile(root):
        return [root]
    out = []
    for pat in DOC_GLOBS:
        out += glob.glob(os.path.join(root, "**", pat), recursive=True)
    out = [p for p in out if not os.path.basename(p).startswith(".")]
    if CORPUS_PREFIXES:
        out = [p for p in out if _prefix(p) in CORPUS_PREFIXES]
    if NUR_REGISTRIERT:
        from adressierung import register
        reg = register()
        vorher = len(out)
        out = [p for p in out if os.path.basename(p) in reg]
        print(f"Nur registrierte Dokumente: {len(out)} von {vorher} Dateien.")
    return sorted(out)[:limit]


def build_converter():
    opts = PdfPipelineOptions()
    opts.do_ocr = OCR_ENABLED
    opts.do_table_structure = True
    opts.table_structure_options.mode = TableFormerMode.ACCURATE
    opts.table_structure_options.do_cell_matching = True
    if OCR_ENABLED:
        from docling.datamodel.pipeline_options import EasyOcrOptions
        opts.ocr_options = EasyOcrOptions(lang=["de", "en"])
    return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})


def build_chunker():
    """1:1 aus Spark: Zähl-Tokenizer nicht bei 512 warnen lassen, Größe via max_tokens."""
    tok = AutoTokenizer.from_pretrained(CHUNK_TOKENIZER)
    max_tokens = tok.model_max_length
    tok.model_max_length = int(1e6)
    return HybridChunker(tokenizer=HuggingFaceTokenizer(tokenizer=tok, max_tokens=max_tokens))


# Satzzeichen, die der Blocksatz der EU-Texte im Wort hinterlässt.
#
# Weicher Trennstrich (U+00AD) und unsichtbare Fugenzeichen: im PDF nicht zu sehen, im
# extrahierten Text mitten im Wort. „wett\xadbewerblichen" ist für BM25 kein Wort, sondern
# zwei Bruchstücke — der Chunk fällt aus der lexikalischen Hälfte der Suche heraus. NFC
# entfernt sie nicht; sie sind gültige Zeichen, nur eben keine Buchstaben.
#
# MIT dem folgenden Leerraum, und das ist nicht nebensächlich: An einem Zeilenumbruch steht
# „Laub\xad baumanteil". Nur das Zeichen zu entfernen ergäbe „Laub baumanteil" — das Wort
# bliebe zerbrochen, nur anders. Ein weicher Trennstrich markiert immer eine Trennstelle
# INNERHALB eines Wortes; was danach kommt, gehört ans Vorige.
_WEICH = re.compile(r"[\u00ad\u200b\u2060]\s*")

# Mehrfacher Leerraum, ebenfalls aus dem Blocksatz. Harmloser als der Trennstrich, aber er
# bläht die Tokenfolge und verschiebt Fenstergrenzen.
_LEERRAUM = re.compile(r"[ \t\u00a0\u2009\u202f]{2,}")


def saeubern(text):
    """Extraktionsartefakte entfernen, bevor eingebettet und indiziert wird.

    Gemessen am 06.10.2026 über den bestehenden Index: 25 Prozent aller Chunks trugen einen
    weichen Trennstrich im Wort, 63 Prozent doppelte Leerzeichen. Betroffen vor allem die
    EU-Verordnungen und die GAK-Förderbereiche — also genau die Dokumente, in denen die
    Retrieval-Messung ihre Pflicht-Fundstellen am häufigsten verfehlte.

    Bewusst konservativ: nur Zeichen, die keinen Bedeutungsgehalt tragen. Zeilenumbrüche
    bleiben, Bindestriche zwischen Wörtern bleiben, Gliederungsnummern bleiben. Was der Text
    AUSSAGT, ändert sich nicht — nur, wie er in Token zerfällt.
    """
    text = _WEICH.sub("", text or "")
    return _LEERRAUM.sub(" ", text)


def embed_batch(texts, retries=4):
    for attempt in range(retries):
        try:
            return embed(texts)
        except Exception as e:  # Rate-Limit/Timeout -> Backoff
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  Embedding-Fehler ({type(e).__name__}); Retry in {wait}s")
            time.sleep(wait)


def textlayer(path):
    """Roher Textlayer je Seite, ohne Layoutanalyse. Ergibt [] für alles außer PDF."""
    if not path.lower().endswith(".pdf"):
        return []
    import pypdfium2
    doc = pypdfium2.PdfDocument(path)
    try:
        return [doc[i].get_textpage().get_text_range() for i in range(len(doc))]
    except Exception:
        return []
    finally:
        doc.close()


def _stuecke(text, max_zeichen=1500):
    """Text in embedbare Stücke teilen, an der jeweils größten noch passenden Grenze.

    Drei Stufen, absteigend: Leerzeile, Zeilenumbruch, harte Kappung. Der Textlayer eines
    Schaubilds kennt keine Absätze — die Kästen kommen als eine einzige Zeilenfolge ohne
    Leerzeile. Eine Teilung, die nur Absätze kennt, gibt dort alles am Stück zurück, und die
    Seite landet als ein einziger übergroßer Chunk im Index, wo sie stillschweigend
    abgeschnitten werden kann.
    """
    def teilen(stueck, muster):
        raus, puffer = [], ""
        for teil in re.split(muster, stueck):
            teil = teil.strip()
            if not teil:
                continue
            if puffer and len(puffer) + len(teil) + 1 > max_zeichen:
                raus.append(puffer)
                puffer = teil
            else:
                puffer = f"{puffer}\n{teil}".strip()
        if puffer:
            raus.append(puffer)
        return raus

    raus = []
    for absatz in teilen(text, r"\n\s*\n"):
        if len(absatz) <= max_zeichen:
            raus.append(absatz)
            continue
        for zeilig in teilen(absatz, r"\n"):
            while len(zeilig) > max_zeichen:       # eine einzelne überlange Zeile
                raus.append(zeilig[:max_zeichen])
                zeilig = zeilig[max_zeichen:]
            if zeilig:
                raus.append(zeilig)
    return raus


def aus_textlayer(path):
    """Sub-Chunks samt Seitenzahl aus dem rohen Textlayer. Ergibt (texte, seiten)."""
    texte, seiten = [], []
    for nr, seite in enumerate(textlayer(path), 1):
        for stueck in _stuecke(unicodedata.normalize("NFC", seite)):
            texte.append(stueck)
            seiten.append([nr])
    return texte, seiten


def pages_of(chunk):
    pages = set()
    for it in getattr(chunk.meta, "doc_items", None) or []:
        for prov in getattr(it, "prov", None) or []:
            pn = getattr(prov, "page_no", None)
            if pn is not None:
                pages.add(pn)
    return sorted(pages)


def main():
    docs = find_docs(CORPUS_DIR, MAX_DOCS)
    if not docs:
        print(f"Keine Dokumente unter {CORPUS_DIR}")
        return
    print(f"{len(docs)} Dokument(e) gefunden.")

    converter = build_converter()
    chunker = build_chunker()
    client = QdrantClient(url=QDRANT_URL)
    abgeloest = veraltete_dokumente()
    if abgeloest:
        print(f"Als veraltet geführt: {', '.join(sorted(abgeloest))}")

    dim = len(embed_batch(["probe"])[0])
    if RECREATE and client.collection_exists(COLLECTION):
        client.delete_collection(COLLECTION)
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            COLLECTION,
            vectors_config={"dense": models.VectorParams(size=dim, distance=models.Distance.COSINE)},
            sparse_vectors_config={"bm25": models.SparseVectorParams(modifier=models.Modifier.IDF)},
        )

    total = 0
    for path in docs:
        name = os.path.basename(path)
        try:
            doc = converter.convert(path).document
        except Exception as e:
            print(f"  [übersprungen] {name}: {type(e).__name__}: {e}")
            continue

        chunks = [c for c in chunker.chunk(doc) if (c.text or "").strip()]
        subs = [saeubern(unicodedata.normalize("NFC", c.text.strip())) for c in chunks]
        headings = [" > ".join(getattr(c.meta, "headings", None) or []) for c in chunks]
        seiten = [pages_of(c) for c in chunks]

        # Rückfall auf den rohen Textlayer.
        #
        # docling stuft Kästen und Pfeile eines Schaubilds als Grafik ein und wirft ihren
        # Text weg. Bei einem Entscheidungsbaum aus dem Korpus blieben von 2.625 Zeichen ein
        # einziger Chunk mit einem Intranet-Link übrig; die Prüffragen und ihre
        # Schwellenwerte standen als Text im PDF und fielen trotzdem weg.
        #
        # Deshalb hier kein Sonderfall für diese Datei, sondern eine Schranke: verliert die
        # Layoutanalyse den Großteil des vorhandenen Textes, wird der rohe Textlayer
        # genommen. Er hat keine Überschriften und keine Gliederung, aber er hat den Inhalt.
        #
        # Die Schranke steht bei 30 Prozent und nicht höher: docling entfernt zu Recht
        # Kopf- und Fußzeilen, und ein Dokument, dessen Seitenzahlen und Behördenkopf
        # wegfallen, ist gesund. Wer zwei Drittel verliert, ist es nicht.
        roh_seiten = textlayer(path)
        roh = sum(len(t) for t in roh_seiten)
        erkannt = sum(len(s) for s in subs)
        if roh >= TEXTLAYER_MIN_ZEICHEN and erkannt < roh * TEXTLAYER_ANTEIL:
            ersatz, ersatz_seiten = aus_textlayer(path)
            if ersatz:
                anteil = 100 * erkannt // max(roh, 1)
                print(f"  [Textlayer] {name}: Layoutanalyse ergab nur {anteil} % des "
                      f"vorhandenen Textes ({erkannt} von {roh} Zeichen), nehme den Textlayer")
                subs, seiten = ersatz, ersatz_seiten
                headings = [""] * len(subs)

        if not subs:
            print(f"  [leer] {name}")
            continue

        # Parent = Sub-Chunks gleicher Überschrift; leere Überschrift -> eigener Parent
        keys = [h or f"__c{i}" for i, h in enumerate(headings)]
        parent_text = {}
        for k, t in zip(keys, subs):
            parent_text[k] = (parent_text.get(k, "") + "\n" + t).strip()[:PARENT_MAX_CHARS]

        ebene = rechtsebene(path)
        status = "veraltet" if name in abgeloest else "aktuell"
        dvecs = []
        for i in range(0, len(subs), EMBED_BATCH):
            dvecs.extend(embed_batch(subs[i:i + EMBED_BATCH]))
        svecs = sparse_many(subs)

        points = []
        for idx, (sn, t, h, k, dv, sv) in enumerate(zip(seiten, subs, headings, keys, dvecs, svecs)):
            points.append(models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{name}:{idx}")),
                vector={"dense": dv, "bm25": sv},
                payload={
                    "text": t,
                    "parent_text": parent_text[k],
                    "parent_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{name}:{k}")),
                    "quelle": name,
                    "abschnitt": h,
                    "seiten": sn,
                    "rechtsebene": ebene,
                    "status": status,
                    "chunk_index": idx,
                },
            ))
        for i in range(0, len(points), 128):  # Qdrant-Payload-Limit 32 MB
            client.upsert(collection_name=COLLECTION, points=points[i:i + 128])
        total += len(points)
        print(f"  {name}: {len(points)} Chunks (Ebene {ebene})")

    print(f"Fertig: {total} Chunks in '{COLLECTION}' (Dimension {dim}, dense+BM25).")


if __name__ == "__main__":
    main()
