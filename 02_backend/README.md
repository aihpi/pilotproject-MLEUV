# Backend, RAG-Durchstich

Ziel dieses ersten Standes: ein RAG-Aufruf für einen Abschnitt läuft end-to-end. Bewusst schlank, ohne Spark-Code und ohne Temporal. Der Spark-Code wird erst herausgelöst, wenn der Durchstich steht.

## Einmalig einrichten

```bash
cd 02_backend
python3 -m venv .venv && source .venv/bin/activate
SETUPTOOLS_SCM_PRETEND_VERSION=0.3 pip install -r requirements.txt   # Grund: requirements.txt
cp .env.example .env      # dann .env ausfüllen
```

In `.env` eintragen: `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LLM_MODEL`, `EMBEDDING_MODEL`. Die Embedding-Dimension musst du nicht setzen, sie wird beim Ingest automatisch erkannt.

## Dienste starten, Schritt 2

```bash
docker compose up -d      # Qdrant auf 6333, docling-serve auf 5001
```

## Ablauf, Schritte 3 bis 5

Alle Befehle aus `02_backend` ausführen.

```bash
python src/test_llm.py                 # Schritt 3: Cluster antwortet? Dimension?
python src/ingest.py                   # Schritt 4: wenige PDFs -> Qdrant
python src/rag_query.py "Welche Angaben gehören in den Zuwendungszweck?"   # Schritt 5
```

## Nachbehandlung der Treffer

Zwei Teile aus `modul-suche-und-zuordnung` (Spark), beide abschaltbar, damit frühere Messungen
vergleichbar bleiben:

```bash
python src/eval.py --rerank rang        # ein Lauf, Modell ordnet die Kandidaten (Vorgabe)
python src/eval.py --rerank konsens     # drei Läufe, Mehrheitsentscheid über die AUSWAHL
python src/eval.py --rerank aus         # ohne Modell, deterministisch

SATZFILTER=false python src/rag_query.py "…"   # Satzfilter aus
```

- **Mehrheitsentscheid** ([retrieval.py](src/retrieval.py)): behält, was mindestens zwei von drei
  Läufen wählen. Das Ergebnis kann kleiner als `TOP_K` sein — das ist beabsichtigt, der Entscheid
  soll verwerfen dürfen. Wählt kein Lauf etwas, fällt er auf die Hybrid-Reihenfolge zurück.
- **Satzfilter** ([satzfilter.py](src/satzfilter.py)): kürzt jeden Kontextblock auf die tragenden
  Sätze und liefert deren Wortlaut mit Satznummer. Anders als Spark bleiben die Satz-Indizes
  erhalten; `beleg_pruefen` hält den Beleg per Zeichenvergleich gegen die Quelle, ohne
  Modellaufruf. Ein Block ohne gewählten Satz fliegt aus Kontext und Nachweis, die Zahl der
  verworfenen Passagen wird gemeldet.

## Wichtig

- **Datenschutz:** Bis der Cluster-Endpoint im Datenschutz-Rahmen bestätigt ist, nur nicht-vertrauliche Dokumente indexieren. `CORPUS_DIR` zeigt per Default auf die Beispiel-Richtlinien, nicht auf die Ordner 05, 06, 07.
- **docling** lädt beim ersten Lauf Modelle herunter, das kann einen Moment dauern.
- **docling-serve** läuft im Compose bereits mit, wird aber vom Durchstich noch nicht genutzt. Die Umstellung auf docling-serve kommt mit dem herausgelösten Spark-Code.
- Details zu den Spark-Teilen, ihrem Einbau und die Arbeitsliste liegen in den Planungsunterlagen (nicht im Repositorium).
