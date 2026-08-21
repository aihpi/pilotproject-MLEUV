"""BM25-Sparse-Vektoren via fastembed (für Hybrid-Retrieval). Modell lazy geladen."""
from fastembed import SparseTextEmbedding
from qdrant_client import models

_bm25 = None


def _model():
    global _bm25
    if _bm25 is None:
        _bm25 = SparseTextEmbedding("Qdrant/bm25")
    return _bm25


def _to_sparse(e):
    return models.SparseVector(indices=e.indices.tolist(), values=e.values.tolist())


def sparse(text):
    return _to_sparse(next(iter(_model().embed([text]))))


def sparse_many(texts):
    return [_to_sparse(e) for e in _model().embed(list(texts))]
