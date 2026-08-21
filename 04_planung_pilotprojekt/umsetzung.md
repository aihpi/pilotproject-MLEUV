# Umsetzung: Meilensteinplan und TODOs

> Status: aktueller Stand 2026-07-10. Termine gemäß [Pilot_Project_Agreement](00_ueberblick/Pilot_Project_Agreement.md).

Projektziel: ein lauffähiger lokaler Assistent, der primär die geführte Erstellung einer Förderrichtlinie unterstützt und sekundär hochgeladene Entwürfe prüft, gemessen am Eval-Set.

## Phasen

| Phase | Fokus | Dauer | Status |
|---|---|---|---|
| 0 Fundament | RAG-Index, Spark-Code herauslösen, Dienste, Eval-Set | ~4 Wochen | Pflicht |
| 1 Assistenz für die Erstellung | geführte Erstellung mit Schreibhilfen und Prüfung je Abschnitt | ~3 Wochen | Pflicht, Kern |
| 2 Prüf-Modus | Upload, Vollständigkeit gegen Vorlage, gleiche Prüfungen | ~2 Wochen | Pflicht, zweitrangig |
| Doku und Auswertung | Evaluation gegen Eval-Set, Abschlussbericht | ~2 Wochen | Pflicht |

Prinzip: erst der RAG-Unterbau, dann die Erstellung als Kern, dann der Prüf-Modus als Aufsatz, der nur den Vollständigkeits-Check ergänzt.

## Phase 0 — Fundament
Fertig, wenn ein RAG-Aufruf für einen Beispielabschnitt belegte Rechtsstellen zurückliefert, Durchstich steht.

**DURCHSTICH ERREICHT (2026-07-17):** end-to-end lief Frage → Embedding (octen-embedding-8b, Dim 4096) → Qdrant → gpt-oss-120b → korrekte deutsche Antwort mit Quellen. Empirische Befunde: Umlaute/§ sauber (bereits NFC); Endpunkt ok; `client.search`→`query_points` gefixt. Offene Befunde: (a) Fundstellen sind nur überschriften-genau → das LLM ERFINDET §-Nummern → echte §/Absatz/Seite-Metadaten nötig (Halluzinations-Risiko genau an der Fundstelle); (b) HybridChunker-Token-Warnung (930>512); (c) docling-OCR-Default ist chinesisch (relevant bei Scans).

**ROBUSTE INGESTION (2026-07-17):** ingest.py neu — Chunker 1:1 von Spark (HuggingFaceTokenizer + model_max_length-Trick, killt (b)); OCR per Default aus (behebt (c), Scans via OCR_ENABLED+easyocr/de); Metadaten seiten/rechtsebene/abschnitt/chunk_index; NFC, Retry/Backoff, DOCX, stabile UUIDs, per-Doc-Fehlerbehandlung. Lauf auf Ordner 04 (§44 LHO+VV): 197 Chunks/7 Docs, alle Ebene Land. Fundstellen-Test: LLM zitiert jetzt Quelle+ECHTE Seite+Abschnitt (ANBest-P S. 4, 5.1–5.6) statt geratener §-Nummern — (a) für die Seitenebene behoben; §/Absatz-genaue Metadaten bleiben als Verfeinerung offen.

- [ ] Dienste hochziehen: Qdrant und docling-serve als lokale Container.
- [ ] LLM-Zugang: LiteLLM-Client gegen HPI-AISC-Endpunkt `https://api.aisc.hpi.de/` (Chat `gpt-oss-120b`, Embedding `octen-embedding-8b`) — verdrahtet, Rauchtest steht aus. Datenschutz GEKLÄRT: 05/06/07 dürfen verarbeitet werden.
- [ ] Spark-Extraktionscode herauslösen, ohne Temporal, Datenquelle auf lokalen Ordner umstellen. Siehe [spark.md](spark.md).
- [ ] Metadaten-Schema umsetzen und Korpus taggen: Rechtsebene, Gültigkeit, Abschnitt, Quelle, Vertraulichkeit. Siehe [datengrundlage.md](datengrundlage.md).
- [ ] Ingestion und Index: Rohdokumente zu Chunks und hypothetischen Fragen, octen-embedding-8b, Qdrant, je Quelle filterbar.
- [ ] B3 Musterrichtlinie maschinenlesbar machen: Abschnitte, Pflicht-Flags, bedingt.
- [ ] Testcases aus dem Index ausschließen.
- [ ] Eval-Set aufbauen: Positiv-GT plus synthetische Fehler, reale MLEUV-Fehlerdaten anfragen.
- [ ] API-Vertrag mit dem Partner grob festlegen: Eingang Abschnitts-ID, Text, Flags; Ausgang Schreibhilfe, Befund, Fundstellen.

## Phase 1 — Assistenz für die Erstellung, Kern
Fertig, wenn die geführte Erstellung end-to-end für einen Testfall läuft, jede Aussage belegt, Mensch entscheidet.

- [ ] Retrieval-Code herauslösen, Query neu bauen aus Abschnittsthema plus Nutzertext, tbm-Teil weglassen.
- [ ] RAG-Aufruf-Dienst nach Diagramm B: Query, Filter, Retrieval Multi-Quelle, Kontext, Prompt, LiteLLM, Ausgabe.
- [ ] B6 Abschnitts-Worker im Erstell-Modus, Schreibhilfe je Abschnitt.
- [ ] B5 Beihilfe-Einordnung und B9 Governance im Prompt, Fundstelle-Pflicht und [Unklar]-Regel.
- [ ] B7 State und Audit mit actor-Feld.
- [ ] B8 Querschnitts-Konsistenz über alle Abschnitte.
- [ ] Anbindung an das Partner-Web-Interface.

## Phase 2 — Prüf-Modus, zweitrangig
Fertig, wenn ein hochgeladener Entwurf zu einem Prüfvermerk mit Befunden und Fundstellen führt.

- [ ] Upload-Pfad.
- [ ] B4 Vollständigkeit gegen die Musterstruktur.
- [ ] dieselben inhaltlichen RAG-Prüfungen wiederverwenden.
- [ ] B11 Prüfvermerk-Export.

## Doku und Auswertung
- [ ] Evaluation gegen das Eval-Set, Erstellen und Prüfen, Stufen A, B, C.
- [ ] RAG-Qualität mit RAGAS: faithfulness, context precision und recall.
- [ ] Abschlussbericht und Roadmap: Framework-Wahl, Weg zum Mehrbenutzerbetrieb.

## Spezifikation je Baustein, spec-light
Wenn eine Phase ansteht, je Baustein eine kurze Spec statt großer Vorab-Doku: Zweck, Modus, Input, Output-Schema mit Pflichtfeldern, Abhängigkeiten, Definition of Done gegen das Eval-Set. Nicht alle 11 vorab spezifizieren.

## Prompts
Die echten Prompts entstehen im Code, nicht in der Planung. Quellen: Konzeptdoc 12 für System- und Abschnitts-Prompts, Anlage 11 für das Beihilfe-Prüfschema. Konvention: jeder Prompt hat ein Output-Schema mit Pflichtfeld `fundstelle` und die [Unklar]-Regel.

## Entscheidungen (Stand 2026-07-17)
- Erstell-Modus wird NICHT mit Spark `berichtskonfigurator` gebaut (Postgres/ORM zu schwer; Struktur/Assemblierung/Export liegt beim Partner-Web-Interface). Stattdessen: RAG in Schreib-Richtung + Abschnitts-Prompts via `prompt-loader`.
- RAG von Anfang an als kleine FastAPI-Naht (nicht nur CLI): zugleich Partner-Schnittstelle und späterer Skalierungspunkt.
- Skalierung = „in Spark hineinwachsen": jetzt Spark-kompatible Qdrant-/Metadaten-Schemas + saubere Modulgrenzen; Temporal/Keycloak/K8s/Postgres-Audit erst zum Mehrbenutzer-/Produktionsübergang.
- LLM/Embeddings extern über HPI AISC (kein Selbst-Hosting); nur Qdrant + docling lokal.
- Spark-Nutzung: LIFT = prompt-loader, prompt-security, ki-validierung/metrics, tatbestandsmerkmalsextraction; Retrieval aus spark-workflow retrieval.py/ranking.py; ADAPT = dokumentenpruefung (Prüf-Modus), graph-api (Stufe Booster); SKIP = norm-matching, subsumtion-service (nur Subsumer-Kern), berichtskonfigurator.

## Kritische offene Punkte / Risiken (Stand 2026-07-17)
- [ ] KRITISCH: Querverweise zwischen Normen — Retrieval holt einen Chunk, die eigentliche Regel steht in einer verwiesenen Norm. Verweise mit-extrahieren/nachladen (kurzfristig Heuristik, langfristig Graph).
- [ ] KRITISCH: Extraktionsqualität — Tabellen (Beihilfe-Prüfschema Anlage 11 IST eine Tabelle), Scans, XLSX-Schwellenwerte. docling-OCR auf diesen Dokumenten verifizieren; XLSX ggf. separat einlesen.
- [ ] Beihilfe (B5) als deterministischer Code-Entscheidungsbaum, NICHT „im Prompt" — Anlage 11 ist Logik. (Weiche: widerspricht dem bisherigen „B5 im Prompt".)
- [ ] Cluster als Produktions-Abhängigkeit: Rate-Limits, Latenz, Modell-Stabilität (mehrere Modelle „Unknown/DB Model"); Modelle pinnen + Fallback, Kapazität klären.
- [ ] Datenschutz-Feinheit: für 05/06/07 am Endpunkt Logging/Retention/kein-Training bestätigen (über „darf verarbeitet werden" hinaus).
- [ ] Gültigkeits-Kuratierung + Reindex-Prozess: welche Fassung gilt, wer/wann aktualisiert bei Gesetzesänderung.
- [ ] Duplikate im Korpus dedupen (z.B. Musterrichtlinie in root und Ordner 05).
- [ ] Konfidenz-Signalisierung im API-Vertrag (über [Unklar]/Fundstelle hinaus).
- [ ] Betriebs-/Wartungs-Ownership in Produktion klären (MLEUV / KISZ / HPI?). — vorerst zurückgestellt.

## Beschlüsse zu den offenen Punkten (2026-07-17)
- Rechts-Graph WIRD gebaut (Booster-Stufe wird verfolgt). Norm-Extraktion = EINMALIGER Batch mit menschlicher Nachbearbeitung/OCR-Check als Freigabe-Gate; erneut nur bei Gesetzesänderung. Der kuratierte Output speist BEIDE Wege: Qdrant (RAG) und graph-api/Neo4j.
- Beihilfe (B5): Teil der Steuerungs-Logik (Partner), deterministisch; ein LLM verknüpft ggf. die freie Nutzereingabe mit den Logik-Parametern. Kein reines Prompt-Raten. (Ersetzt „B5 im Prompt".)
- Cluster (HPI AISC): Interim, langfristig zu ersetzen → LLM-Zugriff bleibt hinter der dünnen `llm.py`-Abstraktion, damit ein Endpunkt-Wechsel trivial bleibt.
- Daten nicht ins Repo: `02_backend/data/` per `.gitignore` ausgeschlossen (erledigt). Internes lokales Logging/Speichern von KI-Interaktionen später gewünscht (Audit), Rohdateien bleiben außerhalb Git.
- Gesetzesänderung: Runbook „wie wird nachgepflegt" als Doku-Deliverable.
- Eval-Set: synthetisch aus vorhandenen Normen, mit Holdout (nicht alle Dokumente einbeziehen), damit ein echter Test möglich bleibt. Reale MLEUV-Fehlerbeispiele weiterhin wünschenswert für die Detektions-Eval.
- Konfidenz-Signalisierung: pro Befund ein Konfidenz-Level in der API-Antwort, damit die UI schwache Aussagen zur Prüfung hervorheben kann.

## Technische Robustheit (2026-07-17) — für den echten Ingest nach dem Rauchtest
Encoding/Text (KRITISCH bei deutschem Rechtskorpus):
- [ ] UTF-8 durchgängig (Datei → Embedding → Qdrant → Prompt → Ausgabe).
- [ ] Unicode-NFC-Normalisierung überall (macOS-Dateinamen sind NFD; Index und Suchanfrage MÜSSEN gleich normalisiert sein).
- [ ] PDF-Cleanup: Silbentrennung am Zeilenumbruch zusammenführen, weiche Trennstriche entfernen, Ligaturen auflösen, `§`/Anführungszeichen korrekt.
Ingest-Robustheit:
- [ ] Retry/Backoff bei Embedding-/LLM-Calls (Rate-Limits/Timeouts).
- [ ] Resumierbar + Fehlerbehandlung pro Dokument (ein kaputtes PDF darf den Lauf nicht killen).
- [ ] Embeddings gebündelt statt ein Call pro Chunk.
- [ ] Stabile/deterministische Chunk-IDs statt uuid4 → Idempotenz + Dedup.
- [ ] DOCX/XLSX-Support (34 DOCX werden aktuell übersprungen); `.DS_Store`/Nicht-Dokumente ausschließen.
Modell-/Limits:
- [ ] Chunk-Größe an Embedding-Token-Limit koppeln (keine stille Truncation).
- [ ] LLM-Context-Budget begrenzen (Kontext-Overflow vermeiden).
- [ ] JSON-Mode/`response_format` des Endpunkts prüfen; sonst Schema in den Prompt.
- [ ] Ausgabesprache im Prompt hart auf Deutsch festlegen.
