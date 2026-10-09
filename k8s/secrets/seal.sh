#!/bin/bash
# Seals secret.yaml into sealed-secret.yaml with the cluster's public key.
#
#   ./seal.sh                     uses the cert at $SEALING_CERT, or fetches it from the cluster
#   SEALING_CERT=cert.pem ./seal.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f secret.yaml ]; then
  echo "secret.yaml is missing. Start from example-secret.yaml." >&2
  exit 1
fi

if [ -n "${SEALING_CERT:-}" ]; then
  kubeseal --format yaml --cert "$SEALING_CERT" < secret.yaml > sealed-secret.yaml
else
  kubeseal --format yaml < secret.yaml > sealed-secret.yaml
fi
echo "Wrote sealed-secret.yaml. Commit it, then sync the app in ArgoCD."
