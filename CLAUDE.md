# CLAUDE.md

Richtlinien-Assistent MLEUV: Werkzeug zur Erstellung und Prüfung von Förderrichtlinien nach
§ 44 LHO. Überblick in [README.md](README.md), Aufbau in [infrastruktur.md](infrastruktur.md),
Betrieb auf dem Cluster in [HOSTING.md](HOSTING.md).

## Aufbau

| Ordner | Was es tut |
|---|---|
| `01_frontend/` | Oberfläche (`apps/web`), Node-API (`apps/api`), gemeinsame Schemas (`packages/shared`) |
| `02_backend/` | Python-Dienst: Aufbereitung, Suche, Vorschlag, Richtlinientext, Messung |
| `02_backend/eval/` | Goldstandard und Messskripte |
| `k8s/` | Manifeste für das Cluster, ArgoCD spielt sie ein |
| `docs/` | Arbeitsabläufe, z. B. [Rückmeldungen einarbeiten](docs/arbeitsablauf-rueckmeldungen.md) |

## Arbeitsablauf

1. Zuerst ein Issue: Feature, oder Task mit Verweis auf das Feature. Der Titel ist wie ein
   Commit-Titel formuliert, daraus entsteht der Branch.
2. Der Feature-Branch geht von `dev` ab, ein Task-Branch vom Feature-Branch. Name:
   `<Issue-Nummer>-<titel>`.
3. Pull Request zurück in den Ausgangsbranch, mit `Closes #n`. Titel: `#n Titel im Imperativ`.
4. Squash-Merge, erst wenn der Workflow `Tests` grün ist.
5. Nach `main` kommt nur `dev`. Ein Push auf `main` baut die Images und setzt neue Tags in
   `k8s/`; ArgoCD bringt sie aufs Cluster.

Commits auf den Branches: höchstens fünf Wörter, kein Body.

## Befehle

```bash
# Backend (aus 02_backend)
uv sync
uv run pytest -q              # ohne Modell, Netz und Qdrant

# Frontend (aus 01_frontend)
npm ci
npm test                      # shared, api, web
npm run typecheck
```

Messläufe gegen den Goldstandard (`eval.py`, `eval_feld.py`, `eval_deckung.py`,
`eval_fundstellen.py`) brauchen Modell und Index und laufen nicht im Workflow. Vor jeder neuen
Kennzahl erst prüfen, ob eins dieser Skripte sie schon misst.

## Datenregeln

- Nichts aus den Ordnern 05–07 des MLEUV-Bestands ins Repo, auch keine Dateinamen daraus.
  Die `*_lokal.yaml` bleiben lokal (siehe `.gitignore`).
- Rückmeldungen, Entwürfe und Protokoll vom Cluster bleiben lokal. In Issues, Pull Requests
  und Commits werden Rückmeldungen nur über ihre Nummer (R-001 …) genannt, nie im Wortlaut.
- Keine Namen oder Kontaktdaten von Personen.
- Vor jedem Push den Stand gegen Titel und Inhalte aus 05–07 prüfen.

## Fachliche Vorgaben

- Das Prozessmodell (BPMN) des MLEUV ist maßgeblich, vor Musterrichtlinie und Code.
- Rückmeldungen der Fachpersonen gelten als Vorgabe, auch wenn sie vorsichtig formuliert
  sind. Widerspricht eine Rückmeldung dem Prozessmodell, entscheidet das Team.
- Das Werkzeug sucht und schlägt vor, es entscheidet nicht.
- Ein Prüffall, dessen Richtlinie selbst im Index liegt, beweist nichts: das Werkzeug findet
  dann nur den eigenen Text wieder.

## Code

- Kommentare sagen, warum etwas so ist, nicht was geschah oder wer es geändert hat.
- Neue Prüffälle zu einer Rückmeldung entstehen vor der Reparatur und schlagen vorher fehl.
