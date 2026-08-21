# Aktueller Stand RAG-Prototyp (Kurzüberblick, 2026-08-07)

## Modelle (über HPI-AISC-Endpunkt, OpenAI-kompatibel via LiteLLM)
- **Embedding:** Qwen3-Embedding-8B (Alias `octen-embedding-8b`) — 4096 Dim, 32k Kontext
- **Antwort + Reranking:** `gpt-oss-120b`

## Chunking
- **docling**-Extraktion (Textlayer, OCR aus), **HybridChunker** (SPARK-Stil, ~512 Token je Sub-Chunk)
- **Parent/Sub:** klein embedden zum Finden, größeren Eltern-Chunk (gleiche Überschrift) ans LLM
- **Metadaten je Chunk:** Quelle, Seite, Abschnitt/Überschrift, Rechtsebene

## Retrieval
- **Hybrid:** dense (Qwen3) + **BM25**-sparse, **RRF**-Fusion (Qdrant nativ)
- **+ LLM-Reranking** der Top-20 → Top-5
- **Governance:** versionierter Prompt (YAML + Audit-Hash), Prompt-Injection-Schutz, Fundstellenpflicht + `[Unklar]`-Regel

## Korpus
- Norm-/Richtlinien-Ordner **03/04/08/10/11**, **~4.889 Chunks** in Qdrant (lokal)

## Eval (LLM-as-Judge Relevanz, Übungsstapel, 5 Fragen)
- **Beantwortbar: 5/5 (100 %)** · **Context-Precision: 84 %** (ohne Reranking: 60 %)

## Testfragen + Top-Treffer (was abgerufen wurde)
| Frage | Top-Treffer (Quelle, Seite, Abschnitt) |
|---|---|
| Mitteilungspflichten des Zuwendungsempfängers? | ANBest-P (S.1) · ANBest-EU (S.8, „5 Pflichten") |
| Nachweise für die Verwendung der Zuwendung? | ANBest-EU21 (S.12, „6.1") · ANBest-EU (S.11, „6 Nachweis der Verwendung") |
| Anforderungen der „Grundsätze für Förderrichtlinien"? | Grundsätze f. Förderrichtlinien (S.1, „Gliederungsschema"; S.3, „7.2 Bewilligungsverfahren") |
| Bestimmungen für EU-kofinanzierte Zuwendungen? | VV Natürliches Erbe (S.19), LEADER (S.22), Beratungs-RL (S.15) — je „7.5 Zu beachtende Vorschriften" |
| Angaben in einen Förderantrag? | Grundsätze f. Förderrichtlinien (S.1 „Gliederungsschema"; S.3 „7.1 Antragsverfahren") · GAK-Rahmenplan (S.20) |

*Fundstellen sind aktuell seiten-genau; §/Absatz-genau ist der nächste Ausbauschritt.*
