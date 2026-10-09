# Gehostete Instanz

Neben dem lokalen Betrieb kann der Richtlinien-Assistent als Live-Demo auf dem Kubernetes-Cluster
des AISC laufen, unter `https://mleuv.aisc.hpi.de`. Dann braucht man nur einen Browser und das
Passwort. Der Aufbau folgt pilotproject-sentra und demo-bibliothekshackaton.

Diese Anleitung ist für die Person, die die Instanz einrichtet und betreut. Für einige Schritte
braucht man Zugang zum Cluster (`kubectl`, `kubeseal`); alles andere passiert in GitHub, Argo CD
und im Browser.

## Inhalt

1. [Wie es läuft](#1-wie-es-läuft)
2. [Was man braucht](#2-was-man-braucht)
3. [Zugangsdaten](#3-zugangsdaten)
4. [Einstellungen](#4-einstellungen)
5. [App in Argo CD anlegen](#5-app-in-argo-cd-anlegen)
6. [Ausrollen und aktualisieren](#6-ausrollen-und-aktualisieren)
7. [Daten und Suchindex](#7-daten-und-suchindex)
8. [Erreichbar machen über Caddy](#8-erreichbar-machen-über-caddy)
9. [Grenzen](#9-grenzen)
10. [Fehlersuche](#10-fehlersuche)

## 1. Wie es läuft

```text
 Browser
   │  https, Passwort
   ▼
 Caddy (außerhalb des Clusters, TLS, basic_auth)
   │
   ▼
 Namespace mleuv
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Service mleuv-web (LoadBalancer)                                     │
 │     │                                                                 │
 │     ▼                                                                 │
 │  web      nginx: Oberfläche, /api ──► api      Node, Fastify         │
 │                                         │  Entwürfe: Volume           │
 │                                         ▼     mleuv-entwuerfe         │
 │                                       backend  Python, FastAPI        │
 │                                         │  Korpus, *_lokal.yaml:      │
 │                                         │  Volume mleuv-daten         │
 │                                         ▼                             │
 │                                       qdrant   Suchindex: Volume      │
 └─────────────────────────────────────────┼────────────────────────────┘
                                           └──► AISC AI Hub (api.aisc.hpi.de)
```

- **Vier Dienste**, dieselben wie lokal (siehe [infrastruktur.md](infrastruktur.md)): die
  Oberfläche hinter nginx, der Node-Dienst für Entwürfe und Word-Export, der Python-Dienst für
  Suche und Vorschläge, und Qdrant.
- **Das Sprachmodell kommt vom AISC AI Hub**, demselben LiteLLM-Endpunkt wie lokal.
- **Vertrauliches liegt nur auf dem Volume `mleuv-daten`**, nie in git und nie in einem Image:
  die Quelldokumente, die `*_lokal.yaml` und `verweise.json`. Sie werden einmal von Hand
  hineinkopiert (Abschnitt 7).
- **Argo CD rollt aus**, wie bei sentra: es beobachtet den Ordner `k8s/` auf `main` und
  synchronisiert, wenn jemand auf *Sync* drückt.

Die beteiligten Dateien:

| Pfad | Inhalt |
| --- | --- |
| `01_frontend/Dockerfile.web`, `01_frontend/nginx.conf` | Image `web`: Vite-Build hinter nginx |
| `01_frontend/Dockerfile.api` | Image `api`: der Node-Dienst |
| `02_backend/Dockerfile` | Image `backend`: der Python-Dienst |
| `.github/workflows/docker-publish.yml` | baut die drei Images bei jedem Push auf `main` und schreibt den neuen Tag nach `k8s/` |
| `k8s/` | die Kubernetes-Manifeste, gelesen von Argo CD |
| `k8s/secrets/` | Zugangsdaten: Beispiel, versiegelte Fassung, Skript zum Versiegeln |
| `02_backend/tests/betrieb/test_k8s.py` | prüft, dass Manifeste, Workflow und nginx zueinander passen |

`01_frontend/Dockerfile` ist die Offline-Demo ohne Backend (`VITE_STATIC=true`) und gehört nicht
zur gehosteten Instanz.

## 2. Was man braucht

- **Zugang zum Cluster** mit `kubectl` und
  [`kubeseal`](https://github.com/bitnami-labs/sealed-secrets). Das braucht nur eine Person.
- **Einen Schlüssel für den AI Hub.** Am besten ein eigener für die Instanz, mit Budget: alle,
  die sie nutzen, verbrauchen davon.
- **Die vertraulichen Daten** aus einer lokalen Installation, die funktioniert (Abschnitt 7).
- **Einen Eintrag in Caddy** für `mleuv.aisc.hpi.de`.

## 3. Zugangsdaten

Die Zugangsdaten liegen in einem Kubernetes-Secret. In git steht es nur versiegelt
(`k8s/secrets/sealed-secret.yaml`), verschlüsselt mit dem öffentlichen Schlüssel des Clusters.
Entschlüsseln kann es nur der Cluster.

Der Klartext steht in `k8s/secrets/secret.yaml`. Die Datei ist in `.gitignore` und darf nie
committet werden.

| Schlüssel | Inhalt |
| --- | --- |
| `AI_HUB_API_KEY` | der Schlüssel für den AI Hub. **Pflicht:** ohne ihn startet der Backend-Pod nicht und nennt den fehlenden Schlüssel. |

**Beim ersten Mal:**

```bash
cd k8s/secrets
cp example-secret.yaml secret.yaml     # Schlüssel eintragen
./seal.sh                              # holt den öffentlichen Schlüssel des Clusters selbst
SEALING_CERT=pfad/zu/cert.pem ./seal.sh   # oder mit einer gespeicherten Kopie
git add sealed-secret.yaml && git commit -m "…"
```

Solange `sealed-secret.yaml` fehlt, meldet Argo CD einen Fehler beim Vergleich, weil die
Kustomization die Datei erwartet. Das ist gewollt: ohne Schlüssel gibt es nichts auszurollen.

Änderungen an den Zugangsdaten wirken nach dem nächsten Sync.

## 4. Einstellungen

Alles, was nicht geheim ist, steht in `k8s/backend/configmap.yaml`. Es sind dieselben Schalter
wie in `02_backend/.env.example`: Modelle, Ausweichketten, Collection, Korpusfilter, `TOP_K`.

Zwei Werte weichen bewusst von der lokalen Vorgabe ab:

| Einstellung | Wert | Warum |
| --- | --- | --- |
| `RECREATE` | `false` | Der Code nimmt ohne Angabe `true` und löscht dann bei jedem Ingest den ganzen Index. Ein Test hält den Wert fest. |
| `QDRANT_URL` | `http://mleuv-qdrant:6333` | der Dienstname im Cluster |

## 5. App in Argo CD anlegen

Einmal, wie bei pilotproject-sentra. In der Oberfläche von Argo CD (*New App*) oder als Manifest:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mleuv
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/aihpi/pilotproject-MLEUV.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: mleuv
  # Kein automatischer Sync: wie bei sentra entscheidet ein Mensch, wann ausgerollt wird.
```

## 6. Ausrollen und aktualisieren

**Jede Änderung nimmt denselben Weg:**

1. Eine Änderung wird nach `main` gemergt.
2. Betrifft sie etwas, das im Image landet (`01_frontend/`, Code, Prompts oder Register in
   `02_backend/`), baut GitHub Actions die drei Images neu, schreibt ihren Tag nach `k8s/` und
   committet das. Das dauert einige Minuten; das Backend-Image ist wegen docling groß. Änderungen
   nur an `k8s/` brauchen kein neues Image.
3. In Argo CD steht die App auf *OutOfSync*. **Sync** drücken.

Argo CD startet dann zuerst Qdrant, danach das Backend, danach Node-Dienst und Oberfläche.

**Ohne Argo CD**, etwa auf einem Testcluster: `kubectl apply -k k8s`

## 7. Daten und Suchindex

Nach dem ersten Sync laufen alle Dienste, aber das Volume `mleuv-daten` und der Index sind leer.
Die Vorschläge bleiben dann ohne Fundstellen. Einmalig, von einem Rechner mit einer lokalen
Installation, die funktioniert:

### 7.1 Dateien auf das Volume

Auf das Volume gehört dasselbe, was lokal in `02_backend/` von git ausgenommen ist. Das Image
verlinkt `data/` und die vier `*_lokal.yaml` dorthin, die Pfade sind also dieselben wie lokal.

```bash
POD=$(kubectl get pod -n mleuv -l app=mleuv-backend -o jsonpath='{.items[0].metadata.name}')
cd 02_backend

# Die abgeleiteten Dateien
for f in korpus_register_lokal.yaml korpusprofile_lokal.yaml musterbausteine_lokal.yaml regeln_roh_lokal.yaml data/verweise.json; do
  kubectl cp "$f" "mleuv/$POD:/data/$(basename "$f")"
done

# Die Quelldokumente, nur die Ordner aus CORPUS_PREFIXES. Ziel mit vollem Namen, weil
# kubectl cp einen Ordner sonst je nachdem hinein- oder darüberkopiert.
kubectl exec -n mleuv "$POD" -- mkdir -p "/data/Daten des MLEUV"
for nr in 01 03 04 08 09 10 11; do
  for ordner in "data/Daten des MLEUV/$nr "*; do
    kubectl cp "$ordner" "mleuv/$POD:/$ordner"     # data/… liegt im Pod unter /data/…
  done
done
```

**Die Ordner 05, 06 und 07 („NICHT VERÖFFENTLICHEN") gehören nicht auf den Cluster.** Sie werden
nicht indiziert, und `/dokument/{datei}` würde sie sonst über das Netz ausliefern können. Aus der
Musterrichtlinie (Ordner 05) stammt allerdings `musterbausteine_lokal.yaml`; deren Satzrahmen
erscheinen in den Vorschlägen. Ob das für eine Instanz hinter einem Passwort in Ordnung ist,
klärt man vorher mit dem MLEUV.

Danach prüfen:

```bash
kubectl exec -n mleuv deploy/mleuv-backend -- python -c \
  "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/gesundheit').read().decode())"
# erwartet: "vorlage_eingelesen": true
```

### 7.2 Den Index füllen

Zwei Wege. **Weg A** übernimmt genau den Index, gegen den gemessen wurde, und ist der schnellere.

**Weg A: Snapshot des lokalen Index.** Lokal einen Snapshot ziehen und im Cluster einspielen:

```bash
# lokal
curl -X POST http://localhost:6333/collections/mleuv_durchstich/snapshots
#   → nennt den Dateinamen; herunterladen:
curl -o mleuv.snapshot http://localhost:6333/collections/mleuv_durchstich/snapshots/<name>

# in den Cluster
kubectl port-forward -n mleuv svc/mleuv-qdrant 16333:6333 &
curl -X POST "http://localhost:16333/collections/mleuv_durchstich/snapshots/upload?priority=snapshot" \
  -F "snapshot=@mleuv.snapshot"
```

Qdrant liest Snapshots einer neueren Version nicht unbedingt. Läuft lokal ein neueres Qdrant als
im Cluster (`k8s/qdrant/deployment.yaml`), lokal vorher dieselbe Version starten.

**Weg B: im Cluster neu aufbauen.** Drei Läufe im Backend-Pod, in dieser Reihenfolge:

```bash
kubectl exec -n mleuv deploy/mleuv-backend -- python src/ingest.py              # PDFs → Index; lädt beim ersten Mal die docling-Modelle
kubectl exec -n mleuv deploy/mleuv-backend -- python src/adressen_schreiben.py   # Adressen und GAK-Gliederung, Sekunden
kubectl exec -n mleuv deploy/mleuv-backend -- python src/verweise_schreiben.py   # Verweise, rund 900 Modellaufrufe
```

Der Ingest dauert je nach Korpus eine Weile und bricht ab, wenn die Verbindung von `kubectl exec`
abreißt. Bei langen Läufen deshalb mit `nohup … &` im Pod starten und das Protokoll verfolgen.

## 8. Erreichbar machen über Caddy

Der Dienst `mleuv-web` hat den Typ `LoadBalancer`, wie sentras Frontend. Seine Adresse:

```bash
kubectl get service mleuv-web -n mleuv
```

Im Caddyfile, mit Passwort wie bei sentra:

```caddyfile
mleuv.aisc.hpi.de {
	basic_auth {
		<benutzer> <bcrypt-hash>     # Hash mit: caddy hash-password
	}
	reverse_proxy <EXTERNAL-IP>:80
}
```

Die Oberfläche benutzt den `Authorization`-Header nicht selbst, `basic_auth` stört hier also
nicht (anders als bei Langflow im Bibliothekshackathon).

Caddy setzt beim `reverse_proxy` von sich aus kein Zeitlimit für die Antwort. Das ist nötig: der
Richtlinientext braucht mehrere Minuten, nginx im Image wartet bis zu 16 Minuten.

## 9. Grenzen

Der Prototyp ist für einen Nutzer auf `127.0.0.1` gebaut ([infrastruktur.md](infrastruktur.md),
„Grenzen"). Auf dem Cluster heißt das:

- **Alle teilen sich die Entwürfe.** Es gibt keine Anmeldung in der Anwendung; jeder, der das
  Passwort kennt, sieht und ändert dieselben Entwürfe (`drafts.json` auf dem Volume
  `mleuv-entwuerfe`). Für eine Vorführung reicht das, für paralleles Arbeiten nicht.
- **`/dokument/{datei}` liefert Quelldokumente aus**, mit zwei Schranken (nur Registriertes, nur
  unterhalb von `CORPUS_DIR`), aber ohne Rechteprüfung. Davor steht nur das Passwort von Caddy.
  Deshalb gehört nur auf das Volume, was ausgeliefert werden darf (Abschnitt 7.1).
- **Ein Pod je Dienst.** Der Node-Dienst hält die Entwürfe im Speicher und schreibt sie als eine
  Datei; ein zweiter Pod würde Änderungen überschreiben.
- **Laufzeiten** wie lokal: Feldvorschlag 40 s bis 2 min, Richtlinientext mehrere Minuten.

## 10. Fehlersuche

| Problem | Lösung |
| --- | --- |
| Argo CD meldet einen Fehler beim Vergleich, `sealed-secret.yaml` fehlt | Abschnitt 3: versiegeln und committen. |
| Backend-Pod hängt in `CreateContainerConfigError` | `AI_HUB_API_KEY` fehlt im Secret. `kubectl describe pod -n mleuv -l app=mleuv-backend` nennt ihn. |
| GitHub Actions: Backend-Build scheitert an `bmds-prompt-loader` oder `bmds-prompt-security` | Die Pakete kommen aus Spark auf gitlab.opencode.de (`requirements.txt`). Ist das Projekt erreichbar und der Tag `v0.3` noch da? |
| Vorschläge ohne Satzrahmen, `/gesundheit` meldet `"vorlage_eingelesen": false` | `musterbausteine_lokal.yaml` fehlt auf dem Volume (Abschnitt 7.1). |
| Vorschläge ohne Fundstellen | Der Index ist leer (Abschnitt 7.2). |
| 504 im Browser bei langen Läufen | Ein Zeitlimit vor nginx. In Caddy kein `timeout` für `reverse_proxy` setzen. |
| Jeder Vorschlag scheitert mit 401 | Der AI-Hub-Schlüssel ist falsch oder abgelaufen. |

**Protokolle:**

```bash
kubectl get pods -n mleuv
kubectl logs -n mleuv deploy/mleuv-backend -f
kubectl logs -n mleuv deploy/mleuv-api -f
```

**Entwürfe sichern:**

```bash
kubectl cp mleuv/$(kubectl get pod -n mleuv -l app=mleuv-api -o jsonpath='{.items[0].metadata.name}'):/app/apps/api/data/drafts.json drafts.json
```
