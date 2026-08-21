# Planung Pilotprojekt — MLEUV Richtlinien-KI-Tool

Zentraler Planungsordner für das KI-Tool zur Erstellung und Prüfung von Förderrichtlinien nach § 44 LHO, Verwaltungsbehörde ELER, MLEUV Brandenburg.

## Worum es geht
Ein lokal betriebener Assistent, primär für die **geführte Erstellung** einer Richtlinie entlang der Musterstruktur mit RAG-Schreibhilfen und belegter Prüfung, sekundär für das **Prüfen** hochgeladener Entwürfe. Erstellung und Prüfung sind dasselbe Wissen in zwei Richtungen.

## Leitplanken
- Assistenz, keine Entscheidung. Jede KI-Ausgabe wird vom Menschen angenommen, editiert oder verworfen.
- On-prem im Datenschutz-Rahmen. Vertrauliche Ordner verlassen das Haus nicht.
- Quellenpflicht. Keine Aussage ohne Fundstelle, Unsicheres als [Unklar].
- Endziel Mehrpersonenbetrieb. Der Pilot ist Einzelnutzer und wächst dorthin.

## Dokumente
| Dokument | Inhalt |
|---|---|
| [architektur.md](architektur.md) | Bausteine B1–B11, Ablauf und RAG-Diagramme, Infrastruktur, Governance |
| [umsetzung.md](umsetzung.md) | Meilensteinplan mit Phasen und konkreten TODOs |
| [datengrundlage.md](datengrundlage.md) | Korpus, Metadaten-Schema, Testcases, Eval-Set |
| [spark.md](spark.md) | Spark-Analyse und Reuse-Machbarkeit |
| [00_ueberblick/Kickoff_Agenda.md](00_ueberblick/Kickoff_Agenda.md) | Kickoff-Agenda |
| [00_ueberblick/Pilot_Project_Agreement.md](00_ueberblick/Pilot_Project_Agreement.md) | Pilotprojekt-Vereinbarung |

## Grundsatzentscheidungen
- **ADR-0001 Lokale Pipeline.** Keine externe Übertragung vertraulicher Dokumente. Entschieden.
- **ADR-0002 Spark komponentenweise herauslösen**, Extraktion und Retrieval, ohne Temporal. Volle Spark-Adoption bleibt Option für den Produktionsübergang. Entschieden.
- **ADR-0003 Erstellung zuerst**, Prüfen zweitrangig. Entschieden.
- **ADR-0004 LLM ist GPT-OSS-120B über LiteLLM** auf dem Cluster. Datenschutz-Rahmen des Endpoints noch zu bestätigen. Offen.

## Vorhandene Assets
Quelldokumente liegen in `02_backend/data`, werden referenziert, nicht kopiert.

| Asset | Rolle |
|---|---|
| Konzeptdoc 12, Promptbasierte Prüfsystematik | Quelle für System- und Abschnitts-Prompts |
| Anlage 04 Musterrichtlinie Land | Quelle für Bauplan B3 |
| Anlage 11 Prüfschema Beihilfe | Quelle für B5 |
| Beispiel-Richtlinien Land, GAK, ELER | Retrieval und Eval-Basis |
