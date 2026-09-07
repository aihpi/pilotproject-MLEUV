import os
from dotenv import load_dotenv

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE, ".env"))


def _model(name):
    """LiteLLM braucht ein Provider-Präfix (z.B. openai/). Ergänzen, falls es fehlt."""
    return name if "/" in name else f"openai/{name}"


# Endpunkt: bevorzugt LITELLM_*, sonst die OPENAI_*-Namen (kompatibel zum HPI-AISC-Snippet)
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL") or os.getenv("OPENAI_API_BASE", "https://api.aisc.hpi.de/")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY") or os.getenv("OPENAI_API_KEY", "")

LLM_MODEL = _model(os.getenv("LLM_MODEL", "openai/qwen3-vl-32b"))
# Bewertendes Modell bewusst != antwortendes Modell: ein Modell beurteilt die eigene Ausgabe milder.
JUDGE_MODEL = _model(os.getenv("JUDGE_MODEL") or "llama-3-3-70b")


def _liste(name, vorgabe):
    roh = os.getenv(name) or vorgabe
    return [_model(m.strip()) for m in roh.split(",") if m.strip()]


# Ausweichmodelle. Der Cluster fällt einzelne Modelle zeitweise aus (mehrfach beobachtet
# am 2026-08-11: mal gpt-oss-120b tot bei laufendem llama, kurz darauf umgekehrt).
# Ohne Kette bricht jeder längere Lauf mittendrin ab.
LLM_FALLBACKS = _liste("LLM_FALLBACKS", "gemma-4-31b,llama-3-3-70b,ministral-3-14b")
# Für den Judge zuerst Modelle, die NICHT das antwortende sind — Unabhängigkeit vor Verfügbarkeit.
JUDGE_FALLBACKS = _liste("JUDGE_FALLBACKS", "gemma-4-31b,ministral-3-14b,gpt-oss-120b")
EMBEDDING_MODEL = _model(os.getenv("EMBEDDING_MODEL") or os.getenv("OPENAI_EMBEDDING_MODEL", "octen-embedding-8b"))

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.getenv("COLLECTION", "mleuv_durchstich")

_corpus = os.getenv("CORPUS_DIR", "data/Daten des MLEUV/09 Rechtsgrundlage Richtlinien MLEUV Land")
CORPUS_DIR = _corpus if os.path.isabs(_corpus) else os.path.join(BASE, _corpus)

MAX_DOCS = int(os.getenv("MAX_DOCS", "5"))
TOP_K = int(os.getenv("TOP_K", "5"))

# Mehrheitsentscheid über die Kandidatenauswahl (Spark, modul-suche-und-zuordnung Stufe 1:
# CONSENSUS_RUNS 3, CONSENSUS_THRESHOLD 2, CONSENSUS_TEMPERATURE 0.3 — hier gleich gesetzt).
# Temperatur bewusst > 0: bei 0 liefern die Läufe dieselbe Antwort und es gibt nichts zu zählen.
KONSENS_LAEUFE = int(os.getenv("KONSENS_LAEUFE", "3"))
KONSENS_SCHWELLE = int(os.getenv("KONSENS_SCHWELLE", "2"))
KONSENS_TEMPERATUR = float(os.getenv("KONSENS_TEMPERATUR", "0.3"))

# Satzfilter: aus jedem Kontextblock nur die tragenden Sätze. Abweichend von Spark (dort 0.7)
# mit Temperatur 0 — die Eval soll wiederholbar bleiben, und Auswahl ist keine Schreibaufgabe.
SATZFILTER = os.getenv("SATZFILTER", "true").lower() == "true"
SATZFILTER_TEMPERATUR = float(os.getenv("SATZFILTER_TEMPERATUR", "0"))
SATZFILTER_MAX_ZEICHEN = int(os.getenv("SATZFILTER_MAX_ZEICHEN", "20000"))  # je Stapel
SATZFILTER_MAX_BLOECKE = int(os.getenv("SATZFILTER_MAX_BLOECKE", "5"))      # je Stapel

# Gültigkeit: kuratierte Liste abgelöster Dokumente (siehe korpus_status.yaml).
# NUR_AKTUELL=false schaltet den Filter ab — für den Vergleich in der Eval.
STATUS_FILE = os.path.join(BASE, "korpus_status.yaml")
NUR_AKTUELL = os.getenv("NUR_AKTUELL", "true").lower() == "true"


def veraltete_dokumente():
    """Dateinamen, die als abgelöst gelten. Leer, wenn die Liste fehlt."""
    try:
        import yaml
        with open(STATUS_FILE, encoding="utf-8") as f:
            daten = yaml.safe_load(f) or {}
    except FileNotFoundError:
        return set()
    return {e["datei"] for e in (daten.get("veraltet") or []) if e.get("datei")}

# Ingestion
OCR_ENABLED = os.getenv("OCR_ENABLED", "false").lower() == "true"  # aus: Textlayer-PDFs; an (+ easyocr) für Scans
CHUNK_TOKENIZER = os.getenv("CHUNK_TOKENIZER", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
EMBED_BATCH = int(os.getenv("EMBED_BATCH", "16"))
RECREATE = os.getenv("RECREATE", "true").lower() == "true"  # Collection bei jedem Lauf neu (Dev)
CORPUS_PREFIXES = [p.strip() for p in os.getenv("CORPUS_PREFIXES", "").split(",") if p.strip()]  # z.B. "03,04,08"; leer = alle
PARENT_MAX_CHARS = int(os.getenv("PARENT_MAX_CHARS", "6000"))  # Kappung des Eltern-Chunks (LLM-Kontext)
