"""Stimmigkeit der Manifeste unter k8s/, die in CI kein Testcluster ausführt."""
import re
from pathlib import Path

import yaml

WURZEL = Path(__file__).resolve().parents[3]
K8S = WURZEL / "k8s"
GEHEIM = "mleuv-secret"


def _dateien():
    return [p for p in sorted(K8S.rglob("*.yaml")) if p.name != "secret.yaml"]


def _dokumente():
    return [d for p in _dateien() for d in yaml.safe_load_all(p.read_text()) if d]


def _container(d):
    return d["spec"]["template"]["spec"]["containers"]


def test_jede_ressource_steht_in_der_kustomization():
    gelistet = set(yaml.safe_load((K8S / "kustomization.yaml").read_text())["resources"])
    vorhanden = {str(p.relative_to(K8S)) for p in _dateien()
                 if p.name not in {"kustomization.yaml", "example-secret.yaml"}}
    assert vorhanden == gelistet


def test_jeder_geheimschluessel_steht_im_beispiel():
    beispiel = yaml.safe_load((K8S / "secrets" / "example-secret.yaml").read_text())
    benutzt = {
        e["valueFrom"]["secretKeyRef"]["key"]
        for d in _dokumente() if d["kind"] == "Deployment"
        for c in _container(d)
        for e in c.get("env", [])
        if e.get("valueFrom", {}).get("secretKeyRef", {}).get("name") == GEHEIM
    }
    assert benutzt
    assert benutzt <= set(beispiel["stringData"])


def test_ci_schreibt_die_images_um_die_die_manifeste_starten():
    workflow = yaml.safe_load((WURZEL / ".github" / "workflows" / "docker-publish.yml").read_text())
    praefix = workflow["env"]["IMAGE_PREFIX"]
    gebaut = {e["name"] for e in workflow["jobs"]["build"]["strategy"]["matrix"]["include"]}
    eigene = {
        c["image"] for d in _dokumente() if d["kind"] == "Deployment"
        for c in _container(d) if c["image"].startswith("ghcr.io/")
    }
    assert {re.match(rf"{re.escape(praefix)}/([a-z]+):", i).group(1) for i in eigene} == gebaut


def test_ingest_loescht_den_index_nicht_von_selbst():
    """Der Code setzt RECREATE ohne Angabe auf true; im Cluster muss es ausdrücklich aus sein."""
    config = next(d for d in _dokumente()
                  if d["kind"] == "ConfigMap" and d["metadata"]["name"] == "mleuv-backend-config")
    assert config["data"]["RECREATE"] == "false"


def test_dienstnamen_passen_zu_den_aufrufen():
    dienste = {d["metadata"]["name"]: d["spec"]["ports"][0]["port"]
               for d in _dokumente() if d["kind"] == "Service"}
    nginx = (WURZEL / "01_frontend" / "nginx.conf").read_text()
    ziel = re.search(r"proxy_pass http://([\w-]+):(\d+);", nginx)
    assert dienste[ziel.group(1)] == int(ziel.group(2))

    adressen = [e["value"] for d in _dokumente() if d["kind"] == "Deployment"
                for c in _container(d) for e in c.get("env", []) if e["name"] == "VORSCHLAG_URL"]
    config = next(d for d in _dokumente() if d["kind"] == "ConfigMap")
    adressen.append(config["data"]["QDRANT_URL"])
    for adresse in adressen:
        name, port = re.match(r"http://([\w-]+):(\d+)", adresse).groups()
        assert dienste[name] == int(port), adresse
