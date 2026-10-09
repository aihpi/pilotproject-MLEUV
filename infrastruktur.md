# Infrastruktur

Werkzeug zur Erstellung von Förderrichtlinien nach § 44 LHO, gebaut für das Fachreferat im
MLEUV Brandenburg. Es führt durch die elf Bausteine der Musterstruktur, schlägt je Feld einen
Wert vor, sagt dazu, woher der Wert kommt, und formuliert am Ende den Text aus. Läuft lokal,
ein Nutzer, ohne Anmeldung. Bedienung: [handbuch.md](handbuch.md).

**Vier Leitplanken erklären fast jede Entscheidung in diesem Dokument:**

1. **Assistenz, keine Entscheidung** — deshalb der Bestätigungsschritt vor jeder Übernahme,
   und deshalb sortiert das Modell, ohne auszuwählen.
2. **Alles im Haus** — die Quelldokumente sind teils vertraulich, deshalb lokale Container,
   `127.0.0.1` und ein Korpusordner außerhalb von git.
3. **Keine Aussage ohne Fundstelle** — Unsicheres heißt `[Unklar]` statt geraten; deshalb der
   Satzfilter mit Zeichenvergleich und kein Ersatzvorschlag bei Ausfall.
4. **Einzelnutzer ist ein Zwischenstand** — Ziel ist Mehrpersonenbetrieb, deshalb liegen
   Schema und Regeln an einer Stelle und der Zustand in Dateien, die eine Datenbank ersetzen kann.

## Auf einen Blick

| Schicht | Womit gebaut | Port | Start | Zustand |
|---|---|---|---|---|
| **Oberfläche** | React 19, Vite, React Router, TanStack Query, KERN UX | 5173 | `npm run dev` in `01_frontend` | keiner |
| **Vorgangsverwaltung** | Node 20, Fastify, zod, `docx` | 4317 | dito (läuft mit) | `apps/api/data/drafts.json` |
| **Wissensdienst** | Python, FastAPI, LiteLLM, docling, fastembed | 8000 | `uvicorn api:app` in `02_backend` | zustandslos |
| **Suchindex** | Qdrant im Container | 6333 | `docker compose up -d` in `02_backend` | `02_backend/.data/qdrant` |
| **Sprachmodell** | LiteLLM-Endpunkt am HPI-Cluster, Ausweichkette | — | extern | — |
| **docling-serve** | Container, läuft mit, **derzeit ungenutzt** | 5001 | dito | — |

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
   ├──► docling          PDF → Chunks (Bibliothek direkt)
   └──► LiteLLM          api.aisc.hpi.de, Ausweichkette über mehrere Modelle
```

**Die Naht zwischen Node und Python:** Node kennt Entwurf, Chat-Stufe und Felddefinitionen
und schickt sie mit; Python kennt Korpus, Musterbausteine und Modell und antwortet mit Wert,
Beleg und Konfidenz. Felddefinitionen werden **nicht** doppelt gepflegt — einzige Quelle ist
`packages/shared`. Fällt Python aus, gibt es **keinen** Ersatzvorschlag.

## Ein Satz auf seinem Weg

Die Bearbeiterin tippt in den Chat:

> „Wir wollen Tierheime im Land Brandenburg fördern, damit der Tierschutz verbessert wird.
> Reine Landesmittel, Zuwendung als Zuschuss."

1. **Node** weiß, dass Baustein 1 an der Reihe ist und welche Felder dazu gehören, und
   schickt beides mit dem Satz an den Python-Dienst.
2. **Suchanfrage bilden** — nicht der Satz geht in die Suche, sondern eine daraus gebaute
   Anfrage mit Abschnittsbezug.
3. **Suchen** — Qdrant liefert Kandidaten nach Bedeutung (Vektoren) und Wortlaut (BM25).
4. **Ordnen oder abstimmen** — das Modell bringt sie in eine Reihenfolge, auf Wunsch drei
   Läufe mit Mehrheitsentscheid.
5. **Kürzen und belegen** — nur die tragenden Sätze bleiben, zeichenweise gegen die Quelle
   geprüft, ohne weiteren Modellaufruf.
6. **Vorschlagen** — je Feld ein Wert im Satzrahmen des Musterbausteins, mit Beleg,
   Fundstelle und Konfidenz; sonst `[Unklar]`.
7. **Bestätigen** — erst „Vorschlag übernehmen" schreibt in den Entwurf, die Prüfregeln
   laufen an, eine begründungspflichtige Abweichung landet im Prüfvermerk.
8. **Am Ende** wird je Abschnitt Text formuliert; heraus kommen zwei Word-Dateien.

Schritt 1–7 zusammen 40 Sekunden bis zwei Minuten, Schritt 8 mehrere Minuten.

## Ordner

| Ordner | Inhalt |
|---|---|
| `01_frontend` | npm-Workspace: `apps/web` (Oberfläche), `apps/api` (Node-Dienst), `packages/shared` (Schema, Abschnitte, Prüfregeln) |
| `02_backend` | Python-Dienst: Aufbereitung, Suche, Vorschlag, Richtlinientext, Messung |
| `03_notebooks` | Notebook-Vorlage |
| `00_aisc` | Logos, Vorlagen |

Die Planungsunterlagen liegen unter `04_planung_pilotprojekt` und sind von git ausgenommen.

# Frontend — `01_frontend`

## Oberfläche · `apps/web/src`

[main.tsx](01_frontend/apps/web/src/main.tsx) startet,
[App.tsx](01_frontend/apps/web/src/App.tsx) ist die Routentabelle — zwei Zeilen, das
Inhaltsverzeichnis der Anwendung. [api.ts](01_frontend/apps/web/src/api.ts) bündelt jeden
Aufruf ans Backend, [api-static.ts](01_frontend/apps/web/src/api-static.ts) dasselbe ohne
Server für die Offline-Demo, [components.tsx](01_frontend/apps/web/src/components.tsx) trägt
Rahmen, Warnkasten, Fortschritt und Statusabzeichen.

| Route | Datei | Aufgabe |
|---|---|---|
| `/` · `/neu` | [Dashboard.tsx](01_frontend/apps/web/src/pages/Dashboard.tsx) | Entwürfe auflisten, Finanzierungsquelle wählen |
| `/pruefen` | [Pruefen.tsx](01_frontend/apps/web/src/pages/Pruefen.tsx) | fertigen Entwurf hochladen und gegen die Musterstruktur halten; hängt an keinem Vorgang |
| `/entwurf/:id/chat` | [Chat.tsx](01_frontend/apps/web/src/pages/Chat.tsx) | geführte Erhebung; darin `Herkunft`, die Deckung von Beleg trennt |
| `/entwurf/:id` · `/abschnitt/:nr` | [Form.tsx](01_frontend/apps/web/src/pages/Form.tsx) | Abschnittsliste und Formular je Baustein |
| `/entwurf/:id/pruefen` | [Review.tsx](01_frontend/apps/web/src/pages/Review.tsx) | Gesamtprüfung: fehlende Pflichtangaben, Prüfhinweise |
| `/entwurf/:id/vermerk` | [Vermerk.tsx](01_frontend/apps/web/src/pages/Vermerk.tsx) | begründen, bestätigen |
| `/entwurf/:id/richtlinie` | [Richtlinie.tsx](01_frontend/apps/web/src/pages/Richtlinie.tsx) | Text erzeugen, Herkunft je Angabe, Word-Export |
| `/entwurf/:id/redaktion` · `/vorschau` | [Review.tsx](01_frontend/apps/web/src/pages/Review.tsx) | **Stufe-2-Mockup** mit erfundenen Fundstellen |

## Vorgangsverwaltung · `apps/api` + `packages/shared`

[server.ts](01_frontend/apps/api/src/server.ts) hält alle Endpunkte an einem Ort und liest
sich wie eine Inhaltsangabe des Ablaufs. Der Zustand ist eine JSON-Datei, kein
Datenbankserver.

[index.ts](01_frontend/packages/shared/src/index.ts) ist das Herz der Anwendung — die einzige
Quelle für alles, was eine Richtlinie ausmacht:

| Bestandteil | Inhalt |
|---|---|
| Entwurfsschema (zod) | Wert, Status, Herkunft, Konfidenz, Bestätigungsmarke je Feld; Version für die Konfliktprüfung |
| Abschnittsdefinitionen | elf Bausteine (0–10) mit Feldern, Typ, Pflicht, Hilfetext, Sichtbarkeitsregeln |
| Chat-Stufen | Reihenfolge der Fragen, Zielfelder je Stufe, Übersprünge nach dem Prozessmodell |
| Prüfregeln | **ohne Modell**, rein gerechnet: Bagatellgrenze 2.500 € (gemeindlich 5.000 €), kommunaler Höchstsatz 80 %, Prüforgane, Geltungsdauer 3 Jahre, Vollfinanzierung, Zuwendungsform |
| Vermerkserzeugung | jede greifende Regel schreibt einen Eintrag fort — offen, beantwortet, bestätigt, gegenstandslos |
| Ausgabe | zwei Word-Dateien, getrennt: Richtlinie und Prüfvermerk |

# Backend — `02_backend`

## Die 25 Module, vier Sorten

**Läuft bei jeder Anfrage (7)**

| Modul | Aufgabe |
|---|---|
| [anfrage.py](02_backend/src/anfrage.py) | baut aus Abschnitt und Eingabe die Suchanfrage |
| [retrieval.py](02_backend/src/retrieval.py) | hybride Suche, Rerang oder Mehrheitsentscheid |
| [sparse.py](02_backend/src/sparse.py) | BM25-Vektoren dazu, 24 Zeilen |
| [satzfilter.py](02_backend/src/satzfilter.py) | kürzt auf tragende Sätze, prüft den Beleg zeichengenau |
| [vorschlag.py](02_backend/src/vorschlag.py) | Wert je Formularfeld — die eigentliche Leistung |
| [richtlinie.py](02_backend/src/richtlinie.py) | formuliert einen Abschnitt aus bestätigten Angaben |
| [begruendung.py](02_backend/src/begruendung.py) | wie frühere Richtlinien dieselbe Abweichung begründet haben |

**Läuft offline, einmal (8)**

| Modul | Aufgabe |
|---|---|
| [ingest.py](02_backend/src/ingest.py) | PDFs → docling → Chunks → Qdrant |
| [adressierung.py](02_backend/src/adressierung.py) + [adressen_schreiben.py](02_backend/src/adressen_schreiben.py) | jedem Textstück sagen, wo es steht (`ANBest-G, Nummer 8.1`) |
| [verweise.py](02_backend/src/verweise.py) + [verweise_schreiben.py](02_backend/src/verweise_schreiben.py) | Verweise auflösbar machen, Nachschlagetabelle bauen |
| [gak_hierarchie.py](02_backend/src/gak_hierarchie.py) | mehrdeutige GAK-Überschriften eindeutig machen |
| [musterbausteine.py](02_backend/src/musterbausteine.py) | Satzrahmen aus der Musterrichtlinie ziehen |
| [regeln.py](02_backend/src/regeln.py) | Prüflogik aus dem Prozessmodell ziehen |

Die Paare `*_schreiben.py` sind die Startskripte zu ihrer Bibliothek: `adressierung.py` kann
rechnen, `adressen_schreiben.py` schreibt das Ergebnis in den Index.

**Betrieb (5)**

| Modul | Aufgabe |
|---|---|
| [api.py](02_backend/src/api.py) | die Endpunkte `/vorschlag`, `/richtlinie`, `/dokument/{datei}`, `/gesundheit` |
| [llm.py](02_backend/src/llm.py) | jeder Modellaufruf, mit Ausweichkette und Zeitlimit |
| [config.py](02_backend/src/config.py) | alle Schalter an einer Stelle — die beste Übersicht über das Stellbare |
| [protokoll.py](02_backend/src/protokoll.py) | schreibt mit, was ein Lauf tatsächlich getan hat |
| [pruefmodus.py](02_backend/src/pruefmodus.py) | hochgeladenen Entwurf zerlegen und gegenhalten — ohne Modell |

**Messen und Werkzeug (5)**

| Modul | Aufgabe |
|---|---|
| [eval.py](02_backend/src/eval.py) | Retrieval gegen Gold-Anker, deterministisch |
| [eval_feld.py](02_backend/src/eval_feld.py) | landet der richtige Wert im richtigen Feld? |
| [judge_antwort.py](02_backend/src/judge_antwort.py) | Antwortqualität; bewertendes Modell ≠ antwortendes |
| [rag_query.py](02_backend/src/rag_query.py) | freie Frage von der Kommandozeile |
| [test_llm.py](02_backend/src/test_llm.py) | 17 Zeilen: antwortet der Cluster, welche Dimension? |

## Wissensbestände

Erzeugt, nicht von Hand gepflegt. Was Wortlaut aus den vertraulichen Ordnern trägt, heißt
`*_lokal.yaml`, liegt außerhalb von git und wird beim Laden über die öffentliche Datei gelegt.

| Bestand | Was darin steht | Wofür |
|---|---|---|
| `korpus_register.yaml` (+ lokal) | Brücke Kurzname ↔ Dateiname, Rechtsebene, Rang | Verweise finden ihr Ziel; zugleich die Liste der Dokumente, über die Auskunft gegeben wird |
| `korpus_status.yaml` | gültig oder abgelöst je Dokument | verhindert Zitate aus überholtem Recht — das größte Rechtsrisiko |
| `musterbausteine_lokal.yaml` | Textbausteine der Musterrichtlinie je Baustein | Satzrahmen; macht Abwesenheit feststellbar („hier fehlt die Kumulierungsregel") |
| `regeln_roh_lokal.yaml` | Regeldokumentationen aus dem Prozessmodell | Rechtsstelle, Schwellenwert, Folge |
| `data/verweise.json` | Adresse → Chunks, auch rückwärts | „Wer verweist auf Nummer 6 der ANBest-P?" |
| `prompts/de/*.yaml` | je Aufgabe ein Prompt mit Prüfsumme | nachvollziehbar, welcher Wortlaut eine Ausgabe erzeugt hat |
| `eval/` | 102 Validierungs-, 36 Holdout-Fälle, Feldfälle, Fragenkatalog | Messung gegen Gold-Anker |

# RAG im Einzelnen

Der Abruf aus dem Korpus und der Aufbau des Kontexts — das Verfahren, das den Unterschied zu
einem beliebigen Textgenerator ausmacht.

## Die Kette, Schritt für Schritt

| # | Schritt | Datei | Stellschraube |
|---|---|---|---|
| 1 | Anfrage bilden: Abschnitt und Eingabe werden zur Suchanfrage. Der Rohtext allein findet deutlich schlechter | `anfrage.py` | — |
| 2 | Hybride Suche: dense (Vektoren) **und** BM25, in Qdrant nativ per RRF zusammengeführt | `retrieval.py`, `sparse.py` | `TOP_K=5` |
| 3 | Nachbehandlung: `rang` — ein Lauf, das Modell ordnet. `konsens` — drei Läufe, behalten wird, was zwei wählen. `aus` — deterministisch | `retrieval.py` | `--rerank`, `KONSENS_LAEUFE=3`, `KONSENS_SCHWELLE=2` |
| 4 | Satzfilter: tragende Sätze je Block, Wortlaut und Satznummer bleiben erhalten; `beleg_pruefen` hält sie per Zeichenvergleich gegen die Quelle | `satzfilter.py` | `SATZFILTER=false` schaltet ab |
| 5 | Vorschlag: je Feld ein Wert im Satzrahmen des Musterbausteins, mit Beleg und Konfidenz | `vorschlag.py` | `abfrageart` |
| — | Korpusfilter, wirken über alles | `config.py` | `NUR_AKTUELL`, `HOLDOUT_DATEIEN`, `CORPUS_PREFIXES` |

**Was in den Index kommt** (`ingest.py`, einmalig): PDF → docling → Sub-Chunks an
Überschriften, Payload trägt den größeren Eltern-Chunk → Adressierung, Verweise,
GAK-Hierarchie → dense + BM25 → Qdrant. Gesucht wird über das kleine Stück, ans Modell geht
das große.

**Abfragesorten** (`vorschlag.py`, aus dem Prozessmodell): `vorschlagen` schränkt auf frühere
Richtlinien und Rahmenpläne ein — dort ist die fremde Richtlinie das **Vorbild**, nicht der
Beleg. Die Oberfläche kennzeichnet das getrennt, weil eine Anlehnung sonst für eine
Rechtsgrundlage gehalten wird.

## Prompts · `prompts/de`

Sechs Dateien, fünf sind angeschlossen. Wer eine Ausgabe ändern will, ändert hier, nicht im Code.

| Datei | Geladen in |
|---|---|
| `satzfilter.yaml` | `satzfilter.py` — tragende Sätze auswählen |
| `feldvorschlag.yaml` | `vorschlag.py` — Wert je Formularfeld |
| `richtlinie_abschnitt.yaml` | `richtlinie.py` — Abschnitt ausformulieren |
| `verweise.yaml` | `verweise.py` — Querverweise ziehen |
| `rag_system.yaml` | `rag_query.py`, `judge_antwort.py` — freie Frage, Antwort-Eval |
| `rag_gak_struktur.yaml` | **nirgends.** Versuchsvariante zur Frage, ob es reicht, dem Modell die GAK-Gliederung zu erklären. Bewusst behalten, damit die Messung zuordenbar bleibt |

## Wo RAG nicht drin ist

Die Hälfte des Werkzeugs arbeitet ohne Suche und ohne Modell — das ist Absicht, denn
Gerechnetes streut nicht:

- **Prüfregeln** in `packages/shared` — Schwellenwerte, gerechnet.
- **Richtlinientext** in `richtlinie.py` — baut aus bestätigten Angaben und Musterbausteinen,
  sucht nichts dazu.
- **Prüfmodus** in `pruefmodus.py` — vergleicht Text gegen Musterstruktur, kein Modellaufruf.
- **Belegprüfung** in `satzfilter.py` — Zeichenvergleich, kein Modellaufruf.

# Betrieb

## Was aus Spark stammt

Übernommen sind Prompts, Schemata und Prüfverfahren, **nicht** die Laufzeitumgebung: Spark
bearbeitet Genehmigungsverfahren mehrerer Mandanten über Temporal, der Pilot einen
Schreibvorgang einer Bearbeiterin in einem Prozess. Rund 6.000 von 55.000 Zeilen.
Lizenz EUPL-1.2, Nachnutzung mit Namensnennung.

| Spark-Teil | Was es dort tut | Wofür wir es nutzen |
|---|---|---|
| `modul-suche-und-zuordnung`, Stufe 2 | Ordnet Voraussetzungen ihren Belegstellen zu und kürzt satzweise auf das Tragende | **Nur die Sätze behalten, um die es geht.** Der Rest fällt weg. Wir merken uns zusätzlich, der wievielte Satz es war — Spark wirft das weg. Dadurch lässt sich Wort für Wort gegen das Originaldokument abgleichen, ob das Zitat wirklich so dasteht, ohne noch einmal ein Modell zu fragen → `satzfilter.py` |
| `modul-suche-und-zuordnung`, `consensus_vote` | Mehrere Läufe, Mehrheitsentscheid über die Auswahl | **Dreimal fragen, abstimmen lassen.** Übrig bleibt, was mindestens zwei Läufe für passend halten. Anders als bei Spark darf weniger übrig bleiben als gesucht — Uneinigkeit ist ein Grund zu verwerfen → `retrieval.py` |
| `risikohinweis-service` | Bewertet Normkollisionen, liefert eine geordnete Liste statt eines Urteils | **Das Modell sortiert, es entscheidet nicht.** Es bringt die Treffer in eine Reihenfolge, wirft nichts weg und urteilt über nichts → `retrieval.py` |
| `rechtsquellenvorbereitung`, `cross_ref_extraction.yaml` | Zieht Querverweise aus Rechtstexten | **Verweise zu Adressen machen.** Rund 10.600 Sätze wie „in den Fällen der Nummer 7.8" — ohne Angabe, wovon. Daraus wird ein Verzeichnis, auch rückwärts lesbar → `verweise.py` |
| `prompt-loader`, `prompt-security` | Prompts als YAML mit sha256-Prüfsumme, Fremdtext gekapselt | **Nachhalten, womit gefragt wurde.** Jede Anweisung bekommt einen Fingerabdruck; Text aus den Dokumenten wird abgetrennt, damit ein Satz aus einer Richtlinie nicht als Anweisung gelesen wird → alle Aufrufe |
| docling-Aufsatz aus Sparks Ingestion | `HybridChunker`, OCR-Konfiguration, `model_max_length`-Kniff | **Dokumente in handliche Stücke schneiden**, getrennt an den Überschriften. Unverändert übernommen → `ingest.py` |

**Vorgesehen, noch nicht im Code:** Normzerlegung (`tatbestandsmerkmalsextraction`),
Prüfinstanz mit acht Fehlerklassen (`modul-bewertung`), Zitatextraktion (`norm-matching`),
Befundform (`modul-risikohinweiser`), Entwurfsprüfung (`modul-formale-pruefung`,
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

Der Korpus ist die Sammlung der Rechts- und Vergleichsdokumente, aus denen zitiert wird:
derzeit **64 Dokumente, 4.889 Textstücke**. Er wird vom MLEUV bereitgestellt, nicht beschafft.
Ein Teil davon ist vertraulich; die Regel gilt ohne Ausnahme:

- **Die Dokumente** liegen unter `02_backend/data`, von git ausgenommen, referenziert statt kopiert.
- **Titel und Inhalte** aus den vertraulichen Ordnern stehen **in keiner Datei dieses Repos**.
  Was Wortlaut trägt, heißt `*_lokal.yaml` und bleibt lokal.
- **`CORPUS_DIR`** zeigt auf den Datenordner, **`CORPUS_PREFIXES`** schränkt auf die
  freigegebenen Unterordner ein.
- **`/dokument/{datei}`** liefert Quelldateien an die Oberfläche — zwei Schranken: nur was im
  Dokumentregister steht, und nur unterhalb von `CORPUS_DIR`. Vor jedem Netzbetrieb braucht
  dieser Endpunkt als Erstes eine Rechteprüfung.
- **`korpus_status.yaml`** hält fest, welche Fassung gilt.

## Start

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

## Prüfen und Messen

```bash
cd 02_backend && uv run pytest -q # tests/rag (Adressierung, Anfrage, Satzfilter, Holdout)
                                  # tests/tool (Vorschlag, Musterbausteine, Prüfmodus, Richtlinie)
                                  # läuft ohne Netz, Modell und Qdrant
python src/eval.py                # Retrieval gegen Gold-Anker
python src/eval_feld.py           # landet der richtige Wert im richtigen Feld?
python src/judge_antwort.py       # Antwortqualität

cd 01_frontend && npm test && npm run typecheck   # Schema, Prüfregeln, Oberfläche
```

**Stand der Messung.** Mit Fundstellen im Prompt arbeitet das Werkzeug zu 88 Prozent
regeltreu, ohne zu 76 (17.09.2026). Der Satzfilter liefert Belege, die zeichengleich zur
Quelle sind — 562 Sätze aus 60 Korpusblöcken geprüft.

**Nicht gemessen:** ob eine Aussage inhaltlich durch ihre Fundstelle gedeckt ist (nicht nur
wörtlich zitiert), die Trefferquote je Formularfeld über den ganzen Katalog, und der
Prüfmodus. Wer eine Zahl braucht, prüft zuerst, ob sie diese Schicht überhaupt misst.

## Grenzen

- **Keine Anmeldung, keine Rechte.** Alles läuft auf `127.0.0.1`.
- **Ein Nutzer, eine Datei.** Konflikte fängt nur die Versionsprüfung beim Speichern ab.
- **Laufzeiten.** Feldvorschlag 40 s bis 2 min, Richtlinientext mehrere Minuten, ohne
  Fortschrittsanzeige.
- **Stufe 2 (`/redaktion`, `/vorschau`) ist ein Mockup** mit fest verdrahteten
  Demo-Fundstellen ab [Review.tsx:216](01_frontend/apps/web/src/pages/Review.tsx#L216). Der
  echte Textweg ist `/richtlinie`.
- **Messung.** `HOLDOUT_DATEIEN` blendet Dokumente aus; wer das übersieht, misst gegen einen
  Torso. `/gesundheit` zeigt die Liste.

## Wortschatz

| Begriff | Bedeutung |
|---|---|
| **Baustein** | einer der elf Abschnitte der Musterstruktur, 0 (Titel) bis 10 (Schlussformel). Im Code `section`. |
| **Musterrichtlinie** | die verbindliche Vorlage des Landes für den Aufbau einer Förderrichtlinie |
| **Musterbaustein** | ein Textbaustein daraus: der Satzrahmen, in den ein Vorschlag eingesetzt wird |
| **Fundstelle** | Dokument und Seite, aus der ein Zitat stammt |
| **Deckung** | die Stelle **der Eingabe**, die einen Wert trägt. Fehlt sie, ist der Wert aus dem Regelfall abgeleitet. |
| **Beleg** | wörtliches Zitat aus dem Korpus, zeichengenau geprüft. Verankert den Vorschlag, **beweist** den Wert nicht. |
| **Vorbild** | eine frühere Richtlinie, an die angelehnt wird: bisherige Praxis, keine Rechtsgrundlage |
| **Prüfvermerk** | das zweite Arbeitsergebnis: die begründungspflichtigen Abweichungen, Anschreiben ans MdFE |
| **Chunk, Textstück** | Ausschnitt eines Dokuments, wie er in den Index geht — geschnitten an Überschriften |
| **Holdout** | Dokumente, die absichtlich nicht im Index liegen, damit eine Messung nicht prüft, was sie kennt |
| **RRF** | Verfahren, das zwei Trefferlisten (Bedeutung und Wortlaut) zu einer zusammenführt |
| **MdFE** | Ministerium der Finanzen und für Europa Brandenburg — Empfänger des Prüfvermerks |
| **MLEUV** | Ministerium für Landwirtschaft, Umwelt und Verbraucherschutz Brandenburg — der Auftraggeber |
| **GAK** | Gemeinschaftsaufgabe „Verbesserung der Agrarstruktur und des Küstenschutzes" |
| **§ 44 LHO** | Landeshaushaltsordnung, die Vorschrift, nach der Zuwendungen gewährt werden |
| **ANBest-P** | Allgemeine Nebenbestimmungen für Zuwendungen zur Projektförderung |
| **KERN UX** | Gestaltungsstandard der öffentlichen Verwaltung, Grundlage der Oberfläche |
| **Spark** | Vorprojekt, aus dem Prompts und Prüfverfahren übernommen sind |
