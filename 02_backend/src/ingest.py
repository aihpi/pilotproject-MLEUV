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
                    CHUNK_TOKENIZER, EMBED_BATCH, RECREATE, CORPUS_PREFIXES, PARENT_MAX_CHARS,
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
    out = []
    for pat in DOC_GLOBS:
        out += glob.glob(os.path.join(root, "**", pat), recursive=True)
    out = [p for p in out if not os.path.basename(p).startswith(".")]
    if CORPUS_PREFIXES:
        out = [p for p in out if _prefix(p) in CORPUS_PREFIXES]
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
        if not chunks:
            print(f"  [leer] {name}")
            continue
        subs = [unicodedata.normalize("NFC", c.text.strip()) for c in chunks]
        headings = [" > ".join(getattr(c.meta, "headings", None) or []) for c in chunks]

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
        for idx, (c, t, h, k, dv, sv) in enumerate(zip(chunks, subs, headings, keys, dvecs, svecs)):
            points.append(models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{name}:{idx}")),
                vector={"dense": dv, "bm25": sv},
                payload={
                    "text": t,
                    "parent_text": parent_text[k],
                    "parent_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{name}:{k}")),
                    "quelle": name,
                    "abschnitt": h,
                    "seiten": pages_of(c),
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
