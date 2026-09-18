# Infrastruktur

Werkzeug zur Erstellung von Förderrichtlinien nach § 44 LHO, gebaut für das Fachreferat im
MLEUV Brandenburg. Es führt durch die elf Bausteine der Musterstruktur, schlägt je Feld einen
Wert vor, sagt dazu, woher der Wert kommt, und formuliert am Ende den Text aus. Läuft lokal,
ein Nutzer, ohne Anmeldung. Bedienung: [handbuch.md](handbuch.md).

**Vier Leitplanken erklären fast jede Entscheidung in diesem Dokument:**

1. **Assistenz, keine Entscheidung.** Jede Ausgabe wird angenommen, geändert oder verworfen —
   deshalb der Bestätigungsschritt vor jeder Übernahme und die Regel, dass das Modell sortiert,
   aber nicht auswählt.
2. **Alles im Haus.** Die Quelldokumente sind teils vertraulich — deshalb lokale Container,
   `127.0.0.1` und ein Korpusordner außerhalb von git.
3. **Keine Aussage ohne Fundstelle.** Unsicheres wird `[Unklar]` genannt statt geraten —
   deshalb der Satzfilter mit Zeichenvergleich und der Verzicht auf Ersatzvorschläge bei Ausfall.
4. **Einzelnutzer ist ein Zwischenstand.** Das Ziel ist Mehrpersonenbetrieb; deshalb liegen
   Schema und Regeln an einer Stelle und der Zustand in Dateien, die eine Datenbank ersetzen kann.

## Der Weg einer Anfrage

```
Browser  :5173   React + Vite, KERN UX
   │  /api/*  (Vite-Proxy)
   ▼
Node     :4317   Fastify  ── Entwurf, Chat-Stufen, Felddefinitionen, Word-Export
   │              Zustand: apps/api/data/drafts.json
   │  POST /vorschlag · /richtlinie
   ▼
Python   :8000   FastAPI  ── Korpus, Musterbausteine, Modellaufrufe
   │
   ├──► Qdrant   :6333   Vektor- und BM25-Index, lokaler Container
   ├──► docling          PDF → Chunks (Bibliothek; docling-serve :5001 läuft mit, ungenutzt)
   └──► LiteLLM         api.aisc.hpi.de, HPI-Cluster, Ausweichkette über mehrere Modelle
```

## Ein Satz auf seinem Weg

Das Beispiel aus dem Demo-Leitfaden. Die Bearbeiterin tippt in den Chat:

> „Wir wollen Tierheime im Land Brandenburg fördern, damit der Tierschutz verbessert wird.
> Reine Landesmittel, Zuwendung als Zuschuss."

1. **Node** weiß, dass gerade Baustein 1 an der Reihe ist und welche Felder dazu gehören
   (Ziel der Förderung, Zuwendungszweck). Beides schickt es mit dem Satz an den Python-Dienst.
2. **Suchanfrage bilden** — nicht der Satz selbst geht in die Suche, sondern eine daraus
   gebaute Anfrage mit dem Abschnittsbezug. Der Rohtext allein findet deutlich schlechter.
3. **Suchen** — Qdrant liefert Kandidaten aus zwei Richtungen gleichzeitig: nach Bedeutung
   (Vektoren) und nach Wortlaut (BM25), zusammengeführt zu einer Liste.
4. **Ordnen oder abstimmen** — das Modell bringt die Kandidaten in eine Reihenfolge; auf
   Wunsch stattdessen drei Läufe mit Mehrheitsentscheid.
5. **Kürzen und belegen** — aus jedem Treffer bleiben die tragenden Sätze. Ihr Wortlaut wird
   zeichenweise gegen das Quelldokument gehalten, ohne weiteren Modellaufruf.
6. **Vorschlagen** — je Feld ein Wert, im Satzrahmen des passenden Musterbausteins, dazu
   Beleg, Fundstelle und Konfidenz. Deckt die Eingabe ein Feld nicht, kommt `[Unklar]` statt
   einer Erfindung.
7. **Zurück in der Oberfläche** steht der Vorschlag mit seiner Herkunft. Erst „Vorschlag
   übernehmen" schreibt ihn in den Entwurf; die Prüfregeln laufen an, und eine
   begründungspflichtige Abweichung landet im Prüfvermerk.
8. **Am Ende** formuliert der Dienst je Abschnitt einen Text aus den bestätigten Angaben —
   und gibt zwei Word-Dateien aus: Richtlinie und Prüfvermerk, getrennt.

Schritt 1 bis 7 dauern zusammen rund 40 Sekunden bis zwei Minuten, Schritt 8 mehrere Minuten.

## Ordner

| Ordner | Inhalt |
|---|---|
| `01_frontend` | npm-Workspace: `apps/web` (Oberfläche), `apps/api` (Node-Dienst), `packages/shared` (Schema, Abschnitte, Prüfregeln) |
| `02_backend` | Python-Dienst: Ingestion, Retrieval, Vorschlag, Richtlinientext, Eval |
| `03_notebooks` | Notebook-Vorlage |
| `00_aisc` | Logos, Vorlagen |

Die Planungsunterlagen (Meilensteine, Befunde, Vereinbarung) liegen unter
`04_planung_pilotprojekt` und sind von git ausgenommen.

## Dienste

| Dienst | Port | Start | Zustand liegt in |
|---|---|---|---|
| Web + Node-API | 5173 / 4317 | `cd 01_frontend && npm run dev` | `apps/api/data/drafts.json` |
| Vorschlagsdienst | 8000 | `cd 02_backend && uvicorn api:app --port 8000 --app-dir src` | zustandslos |
| Qdrant | 6333 | `cd 02_backend && docker compose up -d` | `02_backend/.data/qdrant` |
| docling-serve | 5001 | dito | – |

## Bestandteile

Vier Teile: eine Oberfläche, eine Vorgangsverwaltung, ein Wissensdienst und die
Wissensbestände, aus denen er schöpft.

### 1 Oberfläche — `01_frontend/apps/web`

React + Vite, Bedienelemente nach KERN UX. Elf Seiten, eine Route je Arbeitsschritt.
Bedienung: [handbuch.md](handbuch.md).

| Route | Seite | Aufgabe |
|---|---|---|
| `/` · `/neu` | Übersicht, Neue Richtlinie | Entwürfe auflisten, Finanzierungsquelle wählen |
| `/pruefen` | Entwurf prüfen | fertigen Entwurf hochladen, gegen die Musterstruktur halten; hängt an keinem Vorgang |
| `/entwurf/:id/chat` | Geführte Erhebung | Freitext → Vorschlag je Feld, Herkunft, Beleg im Seitenbereich |
| `/entwurf/:id` · `/abschnitt/:nr` | Abschnittsliste, Formular | elf Bausteine mit Status, Felder erfassen |
| `/entwurf/:id/pruefen` | Gesamtprüfung | fehlende Pflichtangaben, Prüfhinweise |
| `/entwurf/:id/vermerk` | Prüfvermerk | begründen, bestätigen |
| `/entwurf/:id/richtlinie` | Richtlinientext | erzeugen, Befunde, Herkunft, Word-Export |
| `/entwurf/:id/redaktion` · `/vorschau` | Stufe 2 | **Mockup** mit Demo-Daten |

### 2 Vorgangsverwaltung — `apps/api` (Fastify) + `packages/shared`

Der Node-Dienst hält den Vorgang; `packages/shared` ist die einzige Quelle für alles, was
den Aufbau einer Richtlinie beschreibt — Schema, Abschnitte, Stufen, Regeln.

| Bestandteil | Inhalt |
|---|---|
| Entwurfsschema (zod) | Felder mit Wert, Status, Herkunft, Konfidenz und Bestätigungsmarke; Version für die Konfliktprüfung |
| Abschnittsdefinitionen | elf Bausteine (0–10) mit Feldern, Typ, Pflicht, Hilfetext und Sichtbarkeitsregeln |
| Chat-Stufen | Reihenfolge der Fragen, je Stufe Zielfelder; Übersprünge nach dem Prozessmodell |
| Prüfregeln | deterministisch, ohne Modell: Bagatellgrenze 2.500 € (gemeindlich 5.000 €), kommunaler Höchstsatz 80 %, Prüforgane, Geltungsdauer 3 Jahre, Vollfinanzierung, Zuwendungsform |
| Vermerkserzeugung | jede greifende Regel schreibt einen Eintrag fort — offen, beantwortet, bestätigt oder gegenstandslos |
| Ausgabe | zwei Word-Dateien: Richtlinie und Prüfvermerk, getrennt |

### 3 Wissensdienst — `02_backend/src` (FastAPI)

| Gruppe | Module | Aufgabe |
|---|---|---|
| Aufbereitung, offline | `ingest` · `adressierung` · `verweise` · `gak_hierarchie` · `musterbausteine` · `regeln` | Dokumente einlesen und chunken; jedem Chunk sagen, wo er steht; Verweise auflösbar machen; GAK-Überschriften eindeutig machen; Musterbausteine und Regeltexte ziehen |
| Abfrage, je Anfrage | `anfrage` · `retrieval` · `sparse` · `satzfilter` · `vorschlag` · `richtlinie` · `pruefmodus` · `rag_query` | Suchanfrage bilden, hybrid suchen, Kandidaten ordnen, auf tragende Sätze kürzen, Feldwerte vorschlagen, Abschnitte ausformulieren, hochgeladene Entwürfe zerlegen |
| Betrieb | `llm` · `config` · `api` | Modellaufruf mit Ausweichkette und Zeitlimit, Konfiguration, HTTP-Naht |
| Messung | `eval` · `eval_feld` · `judge_antwort` | Retrieval, Feldtreffer und Antwortqualität getrennt messen |

### 4 Wissensbestände — `02_backend`

Erzeugt, nicht von Hand gepflegt. Was Wortlaut aus den vertraulichen Ordnern trägt, liegt als
`*_lokal.yaml` außerhalb von git und wird beim Laden über die öffentliche Datei gelegt.

| Bestand | Was darin steht | Wofür |
|---|---|---|
| `korpus_register.yaml` (+ lokal) | Brücke Kurzname ↔ Dateiname, je Dokument Rechtsebene und Rang | Verweise finden ihr Ziel; zugleich die Liste der Dokumente, über die Auskunft gegeben wird |
| `korpus_status.yaml` | gültig oder abgelöst je Dokument | verhindert Zitate aus überholtem Recht — das größte Rechtsrisiko |
| `musterbausteine_lokal.yaml` | Textbausteine der Musterrichtlinie je Baustein | Satzrahmen für Vorschlag und Text; macht Abwesenheit feststellbar („hier fehlt die Kumulierungsregel") |
| `regeln_roh_lokal.yaml` | Regeldokumentationen aus dem Prozessmodell | Quelle der Prüflogik: Rechtsstelle, Schwellenwert, Folge |
| `data/verweise.json` | Adresse → Chunks, auch rückwärts | „Wer verweist auf Nummer 6 der ANBest-P?" |
| `prompts/de/*.yaml` | je Aufgabe ein versionierter Prompt mit Prüfsumme | nachvollziehbar, welcher Wortlaut eine Ausgabe erzeugt hat |
| `eval/` | 102 Validierungs- und 36 Holdout-Fälle, Feldfälle, Fragenkatalog | Messung gegen Gold-Anker |

### Arbeitsteilung

- **Node** kennt Entwurf, Chat-Stufe und Felddefinitionen und schickt sie mit.
- **Python** kennt Korpus, Musterbausteine und Modell und antwortet mit Wert, Beleg und Konfidenz.
- Felddefinitionen werden **nicht** doppelt gepflegt: einzige Quelle ist `packages/shared`.
- Fällt der Python-Dienst aus, gibt es **keinen** Ersatzvorschlag — lieber keine Zuarbeit als eine erfundene.

### Prüfen und Messen

```bash
cd 02_backend && pytest -q        # tests/rag (Adressierung, Anfrage, Satzfilter, Holdout)
                                  # tests/tool (Vorschlag, Musterbausteine, Prüfmodus, Richtlinie)
                                  # läuft ohne Netz, Modell und Qdrant
python src/eval.py                # Retrieval gegen Gold-Anker, deterministisch
python src/eval_feld.py           # landet der richtige Wert im richtigen Feld?
python src/judge_antwort.py       # Antwortqualität, bewertendes Modell ≠ antwortendes

cd 01_frontend && npm test && npm run typecheck   # Schema, Prüfregeln, Oberfläche
```

**Stand der Messung.** Mit Fundstellen im Prompt arbeitet das Werkzeug zu 88 Prozent
regeltreu, ohne zu 76 (17.09.2026). Der Satzfilter liefert Belege, die zeichengleich zur
Quelle sind — 562 Sätze aus 60 Korpusblöcken geprüft. Gemessen wird gegen 102
Validierungs- und 36 Holdout-Fälle.

**Was nicht gemessen ist:** ob eine Aussage inhaltlich durch ihre Fundstelle gedeckt ist
(nicht nur wörtlich zitiert), die Trefferquote je Formularfeld über den ganzen Katalog, und
der Prüfmodus. Wer eine Zahl braucht, prüft zuerst, ob sie diese Schicht überhaupt misst.

## Zwei Ketten

**Ingestion** (`src/ingest.py`, einmalig): PDF → docling → Sub-Chunks mit Elternkontext →
Adressierung, Verweise, GAK-Hierarchie → dense + BM25 → Qdrant.

**Abfrage** (je Vorschlag, drei Modellrunden, 40 s bis 2 min): Suchanfrage aus Abschnitt und
Eingabe → Hybridsuche mit RRF → Rerang oder Mehrheitsentscheid → Satzfilter mit
zeichengenauer Belegprüfung → Vorschlag je Feld mit Musterbaustein-Rahmen.

## Was aus Spark stammt

Übernommen sind Prompts, Schemata und Prüfverfahren, **nicht** die Laufzeitumgebung: Spark
bearbeitet Genehmigungsverfahren mehrerer Mandanten über Temporal, der Pilot einen
Schreibvorgang einer Bearbeiterin in einem Prozess. Lizenz EUPL-1.2, Nachnutzung mit
Namensnennung.

| Spark-Teil | Was es dort tut | Wofür wir es nutzen |
|---|---|---|
| `modul-suche-und-zuordnung`, Stufe 2 | Ordnet Voraussetzungen ihren Belegstellen zu und kürzt jede Stelle satzweise auf das Tragende | **Nur die Sätze behalten, um die es geht.** Aus jeder gefundenen Passage bleiben die Sätze stehen, die etwas zur Sache sagen; der Rest fällt weg. Wir merken uns zusätzlich, der wievielte Satz es war — Spark wirft das weg. Dadurch können wir Wort für Wort gegen das Originaldokument abgleichen, dass das Zitat wirklich so dasteht, ohne dafür noch einmal ein Modell zu fragen → `src/satzfilter.py`, `prompts/de/satzfilter.yaml` |
| `modul-suche-und-zuordnung`, `consensus_vote` | Mehrere Modellläufe, Mehrheitsentscheid über die Auswahl | **Dreimal fragen, abstimmen lassen.** Dieselbe Frage geht dreimal ans Modell; übrig bleibt, was mindestens zwei Läufe für passend halten. Anders als bei Spark darf am Ende auch weniger übrig bleiben als gesucht — wenn sich die Läufe nicht einig sind, ist das Verwerfen die richtige Antwort → `src/retrieval.py` |
| `risikohinweis-service` | Bewertet Normkollisionen und gibt eine nach Konfidenz geordnete Liste statt eines Urteils | **Das Modell sortiert, es entscheidet nicht.** Die Suche liefert eine Handvoll Treffer, das Modell bringt sie in eine Reihenfolge nach Passgenauigkeit. Es wirft nichts weg und urteilt über nichts — die Auswahl trifft am Ende die Bearbeiterin → `src/retrieval.py`, `--rerank rang` (Vorgabe) |
| `rechtsquellenvorbereitung`, `cross_ref_extraction.yaml` | Zieht Querverweise aus Rechtstexten, auch interne und nackte | **Verweise zu Adressen machen.** In den Dokumenten stehen rund 10.600 Sätze wie „in den Fällen der Nummer 7.8" — ohne Angabe, wovon. Wir schreiben aus jedem Verweis heraus, wohin er zeigt, und legen ein Verzeichnis an. Das lässt sich auch umdrehen: „Wer verweist eigentlich auf Nummer 6 der ANBest-P?" → `src/verweise.py`, `prompts/de/verweise.yaml` |
| `prompt-loader`, `prompt-security` (Pakete `bmds-*`) | Lädt Prompts als YAML mit sha256-Prüfsumme; kapselt Fremdtext in CDATA und entfernt Auszeichnungen | **Nachhalten, womit gefragt wurde — und fremden Text einpacken.** Jede Anweisung ans Modell steht in einer eigenen Datei und bekommt einen Fingerabdruck; später ist damit belegbar, welcher Wortlaut zu welchem Ergebnis geführt hat. Text aus den Dokumenten wird davor abgetrennt, damit ein Satz aus einer Richtlinie nicht als Anweisung gelesen wird → alle Aufrufe, `prompts/de/*.yaml` |
| docling-Aufsatz aus Sparks Ingestion | `HybridChunker` an Überschriften mit Token-Obergrenze, OCR-Konfiguration, `model_max_length`-Kniff | **Dokumente in handliche Stücke schneiden.** Getrennt wird an den Überschriften, damit ein Stück inhaltlich zusammenbleibt und nicht mitten im Satz endet; zu lange Stücke werden weiter geteilt. Gescannte Seiten werden vorher in Text umgewandelt. Unverändert übernommen → `src/ingest.py` |

**Geprüft, vorgesehen, noch nicht im Code:** Normzerlegung (`tatbestandsmerkmalsextraction`),
Prüfinstanz mit acht Fehlerklassen (`modul-bewertung`), Zitatextraktion (`norm-matching`),
Risikostufen (`modul-risikohinweiser`), Entwurfsprüfung (`modul-formale-pruefung`,
`modul-plausibilitaet-pruefung`), Auftragsverwaltung. **Zurückgestellt:** der Rechts-Graph
(`graph-api`, Neo4j). **Entfällt:** Temporal — keines der übernommenen Module nutzt eine
Temporal-Fähigkeit. Die Begründung je Teil steht in den Planungsunterlagen.

## Zustand und Konfiguration

| Was | Wo | Anmerkung |
|---|---|---|
| Entwürfe | `01_frontend/apps/api/data/drafts.json` | Datei statt Datenbank, ein Besitzer |
| Index | `02_backend/.data/qdrant` | `RECREATE=true` löscht ihn beim Ingest |
| Quelldokumente | `02_backend/data` | vollständig von git ausgenommen |
| Schlüssel, Modelle, Korpusfilter | `02_backend/.env` | Vorlage: `.env.example` |
| Regeln, Register, Musterbausteine | `02_backend/*.yaml` | offline erzeugt |
| Prompts | `02_backend/prompts/de/*.yaml` | je Aufgabe eine Datei |

## Korpus und Datenschutz

Der Korpus ist die Sammlung der Rechts- und Vergleichsdokumente, aus denen das Werkzeug
zitiert: derzeit **64 Dokumente, 4.889 Textstücke** im Index. Er wird vom MLEUV
bereitgestellt, nicht beschafft.

Ein Teil davon ist vertraulich. Die Regel dafür gilt ohne Ausnahme:

- **Die Dokumente selbst** liegen unter `02_backend/data` und sind vollständig von git
  ausgenommen. Sie werden referenziert, nie kopiert.
- **Titel und Inhalte** der Dokumente aus den vertraulichen Ordnern stehen **in keiner Datei
  dieses Repos**. Was Wortlaut daraus trägt, heißt `*_lokal.yaml` und bleibt lokal; die
  öffentliche Datei daneben trägt nur die Struktur.
- **`CORPUS_DIR`** zeigt auf den Datenordner, **`CORPUS_PREFIXES`** schränkt auf die
  freigegebenen Unterordner ein.
- **`/dokument/{datei}`** liefert Quelldateien an die Oberfläche aus — zwei Schranken: nur was
  im Dokumentregister steht, und nur was unterhalb von `CORPUS_DIR` liegt. Solange alles an
  `127.0.0.1` hängt, ist das die Festplatte der Bearbeiterin; vor jedem Netzbetrieb braucht
  dieser Endpunkt als Erstes eine Rechteprüfung.
- **`korpus_status.yaml`** hält fest, welche Fassung gilt. Ohne das läge veraltetes Recht
  gleichrangig im Index — das größte Rechtsrisiko des Werkzeugs.

## Start

Die `docker-compose.yml` im Wurzelverzeichnis ist **Fremd-Boilerplate** und zeigt auf Ordner,
die es nicht gibt. Maßgeblich ist `02_backend/docker-compose.yml`.

```bash
# 1 Qdrant und docling-serve
cd 02_backend && docker compose up -d

# 2 Vorschlagsdienst, eigene Shell
cd 02_backend
LITELLM_LOCAL_MODEL_COST_MAP=True .venv/bin/uvicorn api:app --port 8000 --app-dir src

# 3 Weboberfläche und Node-API, eigene Shell — Node 20, nicht neuer
cd 01_frontend && npm install && npm run dev
```

Oberfläche: <http://localhost:5173/>. Einmalig vorher füllt `python src/ingest.py` den Index.

**Vor der Benutzung prüfen** — sonst fehlen die Satzrahmen und die Vorschläge werden
schlechter, ohne dass man es sieht:

```bash
curl -s http://127.0.0.1:8000/gesundheit     # erwartet: "vorlage_eingelesen": true
```

Steht dort `false`, fehlt `musterbausteine_lokal.yaml`; dann einmal
`python src/musterbausteine.py --pdf "<Pfad zur Musterrichtlinie>"` laufen lassen.

## Grenzen

- **Keine Anmeldung, keine Rechte.** Alles läuft auf `127.0.0.1`; der Endpunkt `/dokument/{datei}`
  liefert Quelldateien aus und braucht vor jedem Netzbetrieb als Erstes eine Rechteprüfung.
- **Ein Nutzer, eine Datei.** Gleichzeitiges Arbeiten ist nicht vorgesehen; Konflikte fängt nur
  die Versionsprüfung beim Speichern ab.
- **Laufzeiten.** Ein Feldvorschlag dauert 40 Sekunden bis zwei Minuten, der ganze
  Richtlinientext mehrere. Ohne Fortschrittsanzeige.
- **Stufe 2 (`/redaktion`, `/vorschau`) ist ein Mockup** mit fest verdrahteten Demo-Fundstellen.
  Der echte Textweg ist `/richtlinie`.
- **Messung.** `HOLDOUT_DATEIEN` blendet Dokumente aus dem Index aus; wer das übersieht, misst
  gegen einen Torso. `/gesundheit` zeigt die Liste.

## Wortschatz

| Begriff | Bedeutung |
|---|---|
| **Baustein** | einer der elf Abschnitte der Musterstruktur, von 0 (Titel) bis 10 (Schlussformel). Im Code `section`. |
| **Musterrichtlinie** | die verbindliche Vorlage des Landes für den Aufbau einer Förderrichtlinie |
| **Musterbaustein** | ein Textbaustein daraus: der Satzrahmen, in den ein Vorschlag eingesetzt wird |
| **Fundstelle** | Dokument und Seite, aus der ein Zitat stammt |
| **Deckung** | die Stelle **der Eingabe**, die einen Wert trägt. Fehlt sie, ist der Wert aus dem Regelfall abgeleitet — zwei verschiedene Dinge, in der Oberfläche getrennt dargestellt. |
| **Beleg** | ein wörtliches Zitat aus dem Korpus, zeichengenau gegen die Quelle geprüft. Verankert den Vorschlag, **beweist** den Wert aber nicht. |
| **Prüfvermerk** | das zweite Arbeitsergebnis: die begründungspflichtigen Abweichungen, Anschreiben an das MdFE |
| **Chunk, Textstück** | ein Ausschnitt eines Dokuments, wie er in den Index geht — geschnitten an Überschriften |
| **Holdout** | Dokumente, die absichtlich nicht im Index liegen, damit eine Messung nicht das prüft, was sie kennt |
| **Korpus** | die Sammlung der Dokumente, aus denen zitiert wird |
| **MdFE** | Ministerium der Finanzen und für Europa Brandenburg — Empfänger des Prüfvermerks |
| **MLEUV** | Ministerium für Landwirtschaft, Umwelt und Verbraucherschutz Brandenburg — der Auftraggeber |
| **GAK** | Gemeinschaftsaufgabe „Verbesserung der Agrarstruktur und des Küstenschutzes", Bund-Länder-Förderung mit eigenem Rahmenplan |
| **§ 44 LHO** | Landeshaushaltsordnung, die Vorschrift, nach der Zuwendungen gewährt werden |
| **ANBest-P** | Allgemeine Nebenbestimmungen für Zuwendungen zur Projektförderung |
| **KERN UX** | Gestaltungsstandard der öffentlichen Verwaltung, Grundlage der Oberfläche |
| **Spark** | Vorprojekt, aus dem Prompts und Prüfverfahren übernommen sind |
