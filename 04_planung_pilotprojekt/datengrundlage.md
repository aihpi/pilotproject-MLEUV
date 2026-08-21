# Datengrundlage

> Status: Entwurf.

Alles zum Rechtskorpus, den Metadaten und der Erfolgsmessung.

## Korpus und Aufbereitung
Der Korpus ist noch nicht fertig; die Aufbereitung ist Teil von B1.

| Format | Anzahl | Umgang |
|---|---|---|
| PDF, DOCX, MD | ~130 | über docling-serve extrahieren, in den RAG-Korpus |
| XLSX | 4 | Rechenlogik, kein Prosatext, nicht in den RAG |
| PPTX | 1 | optional, geringer Wert |
| PNG, SVG | 3 | Bilder, ausschließen |

Relevant sind vor allem PDF und DOCX. Die Datengrundlage hängt an B1 und am Metadaten-Tagging, sie ist nicht unabhängig fertig.

Textlayer geprüft am 2026-07-10: alle 96 PDFs im Korpus haben einen extrahierbaren Textlayer, OCR ist nicht nötig. Der OCR-Fallback von docling-serve bleibt für Einzelfälle aktiv. DOCX sind born-digital, PNG und SVG werden ausgeschlossen.

## Metadaten-Schema
Wird von B1 beim Einlesen gesetzt, von B2 zum Filtern genutzt.

```yaml
dokument_id:  slug                 # stabil, nicht der Dateiname
titel:        string
rechtsebene:  EU | Bund | Land      # steuert Normenhierarchie
typ:          Richtlinie | VV | Gesetz | Verordnung | Muster | Formular | Merkblatt | Konzept
stand:        date                  # aus dem Inhalt, nicht nur Dateiname
gueltig_ab:   date | null
gueltig_bis:  date | null
status:       aktuell | veraltet | entwurf   # RAG filtert i.d.R. auf aktuell
abschnitt:    string | null         # welcher der 8 Abschnitte, falls zutreffend
quelle:       Rechtsstelle | Richtlinie | Musterrichtlinie | Pruefschema
vertraulich:  true | false          # Ordner 05, 06, 07 = true
seiten:       int
```

Kernproblem Gültigkeit: Vom GAK-Rahmenplan gibt es mehrere Fassungen. Der RAG-Filter `status: aktuell` verhindert Zitate aus veraltetem Recht, das größte Rechtsrisiko. Das Feld `quelle` erlaubt dem RAG-Aufruf, je Quelle getrennt zu filtern.

## Testcases

| Testcase | Rechtsebene | Einsatz | Warum |
|---|---|---|---|
| RL Katzenkastration | reines Landesrecht | Phase 0–1 | einfachster Fall, keine Beihilfe, klare 8-Abschnitts-Struktur |
| RiLi Schweinehaltung auf Stroh | Land plus Bund, GAK | ab Phase 1–2 | reich, eigener Beihilfe-Abschnitt, trainiert B5 und alle Worker |

Nicht direkt mit Schwein starten: erst die Grundmechanik am einfachen Fall, sonst debuggt man Struktur- und Beihilfe-Fehler gleichzeitig.

## Eval-Set
Ohne gelabelte Fälle keine Evaluation. Zwei Arten Ground Truth aus drei Quellen:

| Quelle | Art | liefert | Aufwand |
|---|---|---|---|
| Fertige Richtlinien | Positiv-GT | Tool darf nichts fälschlich bemängeln | vorhanden |
| Reale MLEUV-Fehlerdaten | Negativ-GT | frühere Entwürfe plus Prüfvermerke, Fehler zu erwartetem Befund | MLEUV liefert |
| Synthetische Fehler | Negativ-GT | korrekte RL mit gezielt eingebautem Fehler | selbst, Phase 0 |

10 bis 20 Fälle reichen für den Start. Geltungsbereich-Stufen müssen alle vorkommen: A nur Land, B Bund plus Land über GAK, C Land plus Bund plus EU mit Beihilfe. So wird sichtbar, wo die Qualität mit steigender Komplexität abfällt.

## Leakage vermeiden
Wir trainieren kein Modell. Training heißt hier RAG-Korpus plus Few-Shot. Kein Eval-Dokument darf im RAG-Index oder als Few-Shot-Beispiel auftauchen. Die Testcases liegen auch im Korpus und müssen aus dem Index ausgeschlossen werden.

## Datenschutz
Die Ordner 05, 06 und 07 sind nicht zu veröffentlichen. Durch die lokale Verarbeitung unkritisch, das Vertraulichkeits-Flag wird trotzdem im Schema geführt. Kritisch bleibt allein der LLM-Endpoint, siehe [architektur.md](architektur.md).
