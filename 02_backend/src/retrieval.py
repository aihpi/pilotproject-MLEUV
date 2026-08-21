"""Hybrid-Retrieval: dense (Qwen3-Embedding-8B) + BM25-sparse, RRF nativ in Qdrant,
danach optionales LLM-Reranking der Kandidaten (Precision-Hebel, SPARK-Muster)."""
import json
import re

from qdrant_client import QdrantClient, models

from llm import embed, chat
from sparse import sparse
from config import QDRANT_URL, COLLECTION, TOP_K, NUR_AKTUELL

_client = None

_RERANK_SYS = (
    "Du rankst Kontext-Passagen nach Relevanz für eine Frage zu Förderrichtlinien nach § 44 LHO. "
    "Gib AUSSCHLIESSLICH JSON zurück: {\"rang\": [Passagennummern, relevanteste zuerst]}."
)


def _c():
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL)
    return _client


def _llm_rerank(query, points, top_k):
    snips = "\n\n".join(
        f"[{i}] {p.payload.get('quelle')}: {(p.payload.get('text') or '')[:400]}"
        for i, p in enumerate(points)
    )
    out = chat(
        [{"role": "system", "content": _RERANK_SYS},
         {"role": "user", "content": f"Frage: {query}\n\nPassagen:\n{snips}"}],
        temperature=0,
    )
    m = re.search(r"\{.*\}", out, re.S)
    try:
        order = json.loads(m.group(0)).get("rang", []) if m else []
    except Exception:
        order = []
    order = [i for i in order if isinstance(i, int) and 0 <= i < len(points)]
    seen = set(order)
    order += [i for i in range(len(points)) if i not in seen]  # Fallback: Rest in Hybrid-Reihenfolge
    return [points[i] for i in order[:top_k]]


def _gueltig_filter(nur_aktuell):
    """Abgelöste Fassungen ausschließen. must_not statt must: Chunks ohne status-Feld
    (Altbestand vor Einführung der Gültigkeits-Kuratierung) bleiben so auffindbar."""
    if not nur_aktuell:
        return None
    return models.Filter(must_not=[
        models.FieldCondition(key="status", match=models.MatchValue(value="veraltet"))
    ])


def hybrid_search(query, top_k=TOP_K, rerank=True, nur_aktuell=NUR_AKTUELL, modus="hybrid"):
    """modus: hybrid (dense+BM25 via RRF) | dense | bm25 — die Einzelmodi dienen dem Vergleich in der Eval."""
    cand = max(top_k * 4, 20)  # mehr Kandidaten holen, dann herunter-reranken
    filt = _gueltig_filter(nur_aktuell)  # schon im Prefetch, sonst verdrängen veraltete Treffer die gültigen
    if modus == "dense":
        res = _c().query_points(collection_name=COLLECTION, query=embed(query)[0], using="dense",
                                query_filter=filt, limit=cand, with_payload=True).points
    elif modus == "bm25":
        res = _c().query_points(collection_name=COLLECTION, query=sparse(query), using="bm25",
                                query_filter=filt, limit=cand, with_payload=True).points
    else:
        res = _c().query_points(
            collection_name=COLLECTION,
            prefetch=[
                models.Prefetch(query=embed(query)[0], using="dense", limit=cand, filter=filt),
                models.Prefetch(query=sparse(query), using="bm25", limit=cand, filter=filt),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            query_filter=filt,
            limit=cand,
            with_payload=True,
        ).points
    if rerank and res:
        return _llm_rerank(query, res, top_k)
    return res[:top_k]
