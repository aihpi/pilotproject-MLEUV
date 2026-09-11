"""Dünne Hülle um LiteLLM: ein Chat- und ein Embedding-Aufruf gegen den Cluster.

Mit Ausweichkette: der Cluster fällt einzelne Modelle zeitweise aus, ohne Vorwarnung.
Ein Lauf über den Eval-Katalog dauert Minuten — ohne Fallback bricht er mittendrin ab
und die Teilergebnisse sind wertlos. Welches Modell tatsächlich geantwortet hat, gibt
`chat` auf Wunsch zurück; für Messungen gehört das ins Protokoll, weil ein Modellwechsel
die Zahlen verschiebt.

Das Zeitlimit ist Teil derselben Sache: die Kette fängt AUSNAHMEN ab, und eine
stehengebliebene Verbindung wirft keine. Ohne Limit wartet sie endlos, statt auf das
nächste Modell zu wechseln — am 2026-09-10 blieb ein Eval-Lauf so 14 Stunden stehen.
"""
import sys

import litellm

from config import (LITELLM_BASE_URL, LITELLM_API_KEY, LLM_MODEL, EMBEDDING_MODEL,
                    LLM_FALLBACKS, LLM_TIMEOUT)

_gemeldet = set()  # jede Ausweichmeldung nur einmal, sonst flutet sie die Ausgabe


def chat(messages, model=LLM_MODEL, temperature=None, fallbacks=None, mit_modell=False,
         ohne_cache=False):
    """ohne_cache: Antwort-Cache umgehen. Nötig, wo mehrere Läufe derselben Anfrage
    unterschiedlich ausfallen SOLLEN — beim Mehrheitsentscheid in retrieval.py würde eine
    gecachte Antwort dreimal dasselbe liefern und die Abstimmung wertlos machen.
    Spark setzt an derselben Stelle `no_cache=True` (llm_invoke in Stufe 1)."""
    kette = [model] + [m for m in (LLM_FALLBACKS if fallbacks is None else fallbacks) if m != model]
    kwargs = {} if temperature is None else {"temperature": temperature}
    if ohne_cache:
        # zweigleisig: `caching` steuert den Cache in LiteLLM selbst, `extra_body` den
        # des Proxy. Versteht der Endpunkt das Feld nicht, ignoriert er es.
        kwargs["caching"] = False
        kwargs["extra_body"] = {"cache": {"no-cache": True}}
    letzter = None
    for kandidat in kette:
        try:
            resp = litellm.completion(
                model=kandidat,
                messages=messages,
                api_base=LITELLM_BASE_URL,
                api_key=LITELLM_API_KEY,
                timeout=LLM_TIMEOUT,
                **kwargs,
            )
            if kandidat != model and kandidat not in _gemeldet:
                print(f"  [Ausweichmodell: {kandidat} statt {model}]", file=sys.stderr)
                _gemeldet.add(kandidat)
            inhalt = resp.choices[0].message.content
            return (inhalt, kandidat) if mit_modell else inhalt
        except Exception as e:
            letzter = e
            continue
    raise RuntimeError(f"Kein Modell der Kette {kette} erreichbar: {letzter}")


def embed(texts, model=EMBEDDING_MODEL):
    if isinstance(texts, str):
        texts = [texts]
    resp = litellm.embedding(
        model=model,
        input=texts,
        api_base=LITELLM_BASE_URL,
        api_key=LITELLM_API_KEY,
        timeout=LLM_TIMEOUT,
    )
    return [item["embedding"] for item in resp.data]
