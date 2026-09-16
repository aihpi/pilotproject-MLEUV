"""Hybrid-Retrieval: dense (Qwen3-Embedding-8B) + BM25-sparse, RRF nativ in Qdrant,
danach optionale Nachbehandlung der Kandidaten (Precision-Hebel, SPARK-Muster):

- „rang"    — ein Lauf, das Modell ordnet die Kandidaten (bisheriges Verhalten)
- „konsens" — mehrere Läufe, Mehrheitsentscheid über die AUSWAHL (Spark, consensus_vote)

Der Rang-Modus bleibt erhalten, damit die Messungen aus den früheren Läufen zuordenbar bleiben.
"""
import json
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from qdrant_client import QdrantClient, models

from llm import embed, chat
from sparse import sparse
from config import (QDRANT_URL, COLLECTION, TOP_K, NUR_AKTUELL,
                    KONSENS_LAEUFE, KONSENS_SCHWELLE, KONSENS_TEMPERATUR)

_client = None

_RERANK_SYS = (
    "Du rankst Kontext-Passagen nach Relevanz für eine Frage zu Förderrichtlinien nach § 44 LHO. "
    "Gib AUSSCHLIESSLICH JSON zurück: {\"rang\": [Passagennummern, relevanteste zuerst]}."
)

# Abgestimmt wird über die Auswahl, nicht über die Rangfolge: eine Menge lässt sich mehrheitlich
# bilden, eine Reihenfolge nicht. Deshalb ein anderer Prompt als beim Reranking.
_KONSENS_SYS = (
    "Du prüfst, welche Kontext-Passagen für eine Frage zu Förderrichtlinien nach § 44 LHO "
    "einschlägig sind. Du beurteilst NICHT die Frage selbst, du wählst nur aus. "
    "Nimm im Zweifel die Passage mit auf. Gib AUSSCHLIESSLICH JSON zurück: "
    "{\"relevant\": [Passagennummern]}."
)


def _c():
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL)
    return _client


def _json_feld(out, feld):
    """Liste aus der Modellantwort ziehen. Leer, wenn nichts Brauchbares kommt — der Aufrufer
    entscheidet dann über den Rückfall, statt hier eine Ausnahme zu werfen."""
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        return []
    try:
        werte = json.loads(m.group(0)).get(feld, [])
    except Exception:
        return []
    return werte if isinstance(werte, list) else []


def _passagen(points, max_zeichen=400):
    return "\n\n".join(
        f"[{i}] {p.payload.get('quelle')}: {(p.payload.get('text') or '')[:max_zeichen]}"
        for i, p in enumerate(points)
    )


def _llm_rerank(query, points, top_k):
    out = chat(
        [{"role": "system", "content": _RERANK_SYS},
         {"role": "user", "content": f"Frage: {query}\n\nPassagen:\n{_passagen(points)}"}],
        temperature=0,
    )
    order = [i for i in _json_feld(out, "rang") if isinstance(i, int) and 0 <= i < len(points)]
    seen = set(order)
    order += [i for i in range(len(points)) if i not in seen]  # Fallback: Rest in Hybrid-Reihenfolge
    return [points[i] for i in order[:top_k]]


def _llm_konsens(query, points, top_k, laeufe=None, schwelle=None):
    """Mehrfachabfrage mit Mehrheitsentscheid (Spark: consensus_vote, 21 Zeilen).

    Ein Einzellauf streut bei Auswahlfragen zu stark; behalten wird, was mindestens
    `schwelle` von `laeufe` Läufen wählt. Reihenfolge: Stimmen absteigend, bei Gleichstand
    die Hybrid-Reihenfolge — die trägt die einzige Information, die nicht vom Modell kommt.

    Anders als Spark kann das Ergebnis KLEINER als top_k sein. Das ist der Punkt: der
    Mehrheitsentscheid soll verwerfen dürfen. Wählt keiner der Läufe etwas (oder scheitert
    das Parsen durchgehend), fällt die Funktion auf die Hybrid-Reihenfolge zurück — wie
    Spark, das bei einem Fehlschlag in Stufe 1 alle Knoten weiterreicht.
    """
    laeufe = laeufe or KONSENS_LAEUFE
    schwelle = schwelle or KONSENS_SCHWELLE
    nachricht = [{"role": "system", "content": _KONSENS_SYS},
                 {"role": "user", "content": f"Frage: {query}\n\nPassagen:\n{_passagen(points)}"}]

    def _lauf(_):
        # Threads statt asyncio: der Rest des Backends ist synchron, litellm blockiert.
        # ohne_cache, sonst liefern drei gleiche Anfragen dieselbe Antwort und es gibt
        # nichts abzustimmen (Spark: no_cache=True).
        try:
            return _json_feld(chat(nachricht, temperature=KONSENS_TEMPERATUR, ohne_cache=True),
                              "relevant")
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=laeufe) as pool:
        antworten = list(pool.map(_lauf, range(laeufe)))

    stimmen = Counter()
    for antwort in antworten:
        # set(): ein Lauf, der dieselbe Passage zweimal nennt, hat trotzdem eine Stimme
        stimmen.update({i for i in antwort if isinstance(i, int) and 0 <= i < len(points)})

    gewaehlt = [i for i, anzahl in stimmen.items() if anzahl >= schwelle]
    if not gewaehlt:
        return points[:top_k]
    gewaehlt.sort(key=lambda i: (-stimmen[i], i))
    return [points[i] for i in gewaehlt[:top_k]]


def _gueltig_filter(nur_aktuell, nur_arten=None):
    """Abgelöste Fassungen ausschließen, wahlweise auf Dokumentarten einschränken.

    must_not für den Status: Chunks ohne status-Feld (Altbestand vor Einführung der
    Gültigkeits-Kuratierung) bleiben so auffindbar.

    `nur_arten` dagegen ist ein must — hier ist das Weglassen der Chunks ohne Feld richtig.
    Wer „nur Richtlinien" verlangt, will kein Dokument dabeihaben, dessen Art unbekannt ist.
    Das trifft alles, was nicht im Register steht und alles, worauf `adressen_schreiben.py`
    noch nicht gelaufen ist.
    """
    bedingungen = []
    if nur_aktuell:
        bedingungen.append(("must_not", models.FieldCondition(
            key="status", match=models.MatchValue(value="veraltet"))))
    if nur_arten:
        bedingungen.append(("must", models.FieldCondition(
            key="art", match=models.MatchAny(any=list(nur_arten)))))
    if not bedingungen:
        return None
    return models.Filter(
        must=[c for art, c in bedingungen if art == "must"] or None,
        must_not=[c for art, c in bedingungen if art == "must_not"] or None,
    )


def hybrid_search(query, top_k=TOP_K, rerank=True, nur_aktuell=NUR_AKTUELL, modus="hybrid",
                  nur_arten=None):
    """modus: hybrid (dense+BM25 via RRF) | dense | bm25 — die Einzelmodi dienen dem Vergleich in der Eval.

    rerank: True/„rang" (ein Lauf, Rangfolge) | „konsens" (Mehrheitsentscheid) | False (aus).
    nur_arten: Dokumentarten, auf die eingeschränkt wird, z. B. ["richtlinie", "rahmenplan"].
    """
    cand = max(top_k * 4, 20)  # mehr Kandidaten holen, dann herunter-reranken
    # schon im Prefetch, sonst verdrängen veraltete oder artfremde Treffer die gesuchten
    filt = _gueltig_filter(nur_aktuell, nur_arten)
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
    if res and rerank == "konsens":  # vor dem Rang-Zweig: der String ist ebenfalls wahr
        return _llm_konsens(query, res, top_k)
    if res and rerank:
        return _llm_rerank(query, res, top_k)
    return res[:top_k]
