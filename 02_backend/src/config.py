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

# Zeitlimit je Modellaufruf. Ohne eines hängt eine stehengebliebene Verbindung endlos —
# am 2026-09-10 blieb ein Eval-Lauf so 14 Stunden stehen. Entscheidend ist nicht die
# Wartezeit, sondern dass die Ausweichkette in llm.py nur AUSNAHMEN abfängt: ein Hänger ist
# keine, also greift sie ohne Limit gar nicht.
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "120"))

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

# Eigene Temperatur für den Mehrheitsentscheid über FELDVORSCHLÄGE: dort 0, nicht 0.3.
# Die Begründung oben — bei 0 liefern die Läufe dieselbe Antwort — gilt für die
# Kandidatenauswahl, nicht hier: gpt-oss-120b streut bei Feldvorschlägen auch bei 0 von
# selbst (am 2026-09-11 dreimal derselbe Fall, dreimal ein anderes Ergebnis, durchgehend
# dasselbe Modell). Mit 0.3 fiel der Prüffall F-05 von 2/3 auf 1/3 — die Temperatur kaufte
# nur Rauschen.
KONSENS_TEMPERATUR_FELD = float(os.getenv("KONSENS_TEMPERATUR_FELD", "0"))

# Satzfilter: aus jedem Kontextblock nur die tragenden Sätze. Abweichend von Spark (dort 0.7)
# mit Temperatur 0 — die Eval soll wiederholbar bleiben, und Auswahl ist keine Schreibaufgabe.
SATZFILTER = os.getenv("SATZFILTER", "true").lower() == "true"
SATZFILTER_TEMPERATUR = float(os.getenv("SATZFILTER_TEMPERATUR", "0"))
SATZFILTER_MAX_ZEICHEN = int(os.getenv("SATZFILTER_MAX_ZEICHEN", "20000"))  # je Stapel
SATZFILTER_MAX_BLOECKE = int(os.getenv("SATZFILTER_MAX_BLOECKE", "5"))      # je Stapel

# Abschnittsbindung: Beim Ausfüllen eines Bausteins nur Fundstellen aus demselben Baustein
# anderer Richtlinien — Nummer 5 zu Nummer 5, Verfahren zu Verfahren.
#
# Grund ist eine wiederkehrende Beobachtung aus den Durchläufen: Die Suche findet Textstellen,
# die thematisch passen, aber eine andere Frage beantworten. Zu den FÖRDERAUSSCHLÜSSEN (B2,
# ausgeschlossene Maßnahmen) kam eine Stelle über nicht förderfähige KOSTEN (B5) — dieselben
# Wörter, ein anderer Begriff. Semantisch ist das nicht zu trennen, über die Gliederung schon.
#
# Nur im Vorschlagspfad. Chat und Prüfmodus brauchen den GAK-Rahmenplan und das EU-Beihilfe-
# recht als Maßstab; die tragen keinen Baustein und fielen sonst heraus.
# ABSCHNITTSBINDUNG=false schaltet ab — für den Vergleich in der Messung.
ABSCHNITTSBINDUNG = os.getenv("ABSCHNITTSBINDUNG", "true").lower() == "true"

# Feldbindung: je ZIELFELD eine eigene Suche statt einer gemeinsamen je Abschnitt.
#
# Die Abschnittsbindung löst das Problem nicht, das sie lösen sollte: Baustein 5 hat elf
# Felder, und eine Stelle zur Finanzierungsart beantwortet die Frage nach dem Höchstbetrag
# nicht. Alle 22 am 08.10.2026 verworfenen Fundstellen wurden mit genau diesem Muster
# begründet — richtiger Abschnitt, falsches Feld.
#
# FELDBINDUNG=false schaltet auf die gemeinsame Anfrage zurück — für den Vergleich.
FELDBINDUNG = os.getenv("FELDBINDUNG", "true").lower() == "true"

# Gültigkeit: kuratierte Liste abgelöster Dokumente (siehe korpus_status.yaml).
# NUR_AKTUELL=false schaltet den Filter ab — für den Vergleich in der Eval.
STATUS_FILE = os.path.join(BASE, "korpus_status.yaml")
NUR_AKTUELL = os.getenv("NUR_AKTUELL", "true").lower() == "true"

# Quelldateien, die bei jeder Suche ausgeblendet werden — der Holdout.
#
# Wer eine Richtlinie nachbaut, die selbst im Korpus liegt, bekommt sie als Beleg zurück.
# Das Werkzeug schreibt dann ab, statt herzuleiten, und das Ergebnis sieht besser aus, als
# es ist (beobachtet am 17.09.2026 an der Katzenkastrationsrichtlinie: Zuwendungszweck mit
# 94 % Konfidenz, belegt aus Nummer 1.1 derselben Richtlinie).
#
# Als Umgebungsvariable und nicht je Anfrage, weil die Node-Seite davon nichts weiß und ein
# Durchlauf im Browser sonst weiter gegen den vollen Korpus liefe. Ein Holdout gehört ohnehin
# zum Messaufbau und nicht zur einzelnen Frage.
#
# Damit wirkt er still, und das ist gefährlich — wer ihn vergisst, misst gegen einen Torso
# und hält ihn für den Korpus. Deshalb steht er in /gesundheit und im Nachweis jeder Antwort.
#
#     HOLDOUT_DATEIEN=RL Katzenkastration.pdf,RL Neuimker vom 26.pdf
HOLDOUT_DATEIEN = [d.strip() for d in os.getenv("HOLDOUT_DATEIEN", "").split(",") if d.strip()]


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
# Nur einlesen, was im Dokumentregister steht.
#
# Ein Ordner enthält nicht nur Regelwerk. Der vertrauliche Ordner 06 etwa besteht zu vier
# Fünfteln aus Formularen des Bewilligungsverfahrens — acht fast wortgleiche Bescheidmuster,
# Antragsvordrucke, Kontroll-Checklisten. Die helfen beim Schreiben einer Richtlinie nicht
# und konkurrieren bei jeder Suche mit.
#
# Das Register entscheidet ohnehin schon über Identität, Art und Zitierweise eines
# Dokuments. Mit diesem Schalter entscheidet es auch über die Aufnahme: Was aufgenommen
# werden soll, wird registriert — und bekommt damit zugleich eine Adresse. Ein Dokument
# ohne Registereintrag wäre ohnehin halb blind, weil der Filter nach Dokumentart es
# aussortiert.
NUR_REGISTRIERT = os.getenv("NUR_REGISTRIERT", "false").lower() == "true"
# Rückfall auf den rohen Textlayer, wenn die Layoutanalyse ein Dokument verliert — siehe
# die Begründung in ingest.py. Greift erst ab einer Textmenge, bei der ein Verlust auch
# etwas bedeutet; ein Deckblatt mit 200 Zeichen soll keinen Rückfall auslösen.
TEXTLAYER_MIN_ZEICHEN = int(os.getenv("TEXTLAYER_MIN_ZEICHEN", "1000"))
TEXTLAYER_ANTEIL = float(os.getenv("TEXTLAYER_ANTEIL", "0.3"))
PARENT_MAX_CHARS = int(os.getenv("PARENT_MAX_CHARS", "6000"))  # Kappung des Eltern-Chunks (LLM-Kontext)
