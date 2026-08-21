# Backend, RAG-Durchstich

Ziel dieses ersten Standes: ein RAG-Aufruf für einen Abschnitt läuft end-to-end. Bewusst schlank, ohne Spark-Code und ohne Temporal. Der Spark-Code wird erst herausgelöst, wenn der Durchstich steht.

## Einmalig einrichten

```bash
cd 02_backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
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

## Wichtig

- **Datenschutz:** Bis der Cluster-Endpoint im Datenschutz-Rahmen bestätigt ist, nur nicht-vertrauliche Dokumente indexieren. `CORPUS_DIR` zeigt per Default auf die Beispiel-Richtlinien, nicht auf die Ordner 05, 06, 07.
- **docling** lädt beim ersten Lauf Modelle herunter, das kann einen Moment dauern.
- **docling-serve** läuft im Compose bereits mit, wird aber vom Durchstich noch nicht genutzt. Die Umstellung auf docling-serve kommt mit dem herausgelösten Spark-Code.
- Details zur Architektur: `../04_planung_pilotprojekt/architektur.md`, zum Herauslösen: `../04_planung_pilotprojekt/spark.md`.
