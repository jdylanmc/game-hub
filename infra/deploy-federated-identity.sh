#!/usr/bin/env bash

set -euo pipefail

TARGET="${1:-}"
SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"
BICEP_VERSION="v0.42.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! "$TARGET" =~ ^(adversarial-review|test|prod)$ ]]; then
  echo "Usage: ./infra/deploy-federated-identity.sh <adversarial-review|test|prod>" >&2
  exit 1
fi

parameter_file="$SCRIPT_DIR/federated-identity-${TARGET}.bicepparam"
deployment_name="adversarial-federation-${TARGET}-$(date -u +%Y%m%d%H%M%S)"

az account set --subscription "$SUBSCRIPTION_ID"
test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"
az bicep install --version "$BICEP_VERSION"
az bicep build-params --file "$parameter_file" --stdout > /dev/null

parameters=(
  --location eastus
  --name "$deployment_name"
  --parameters "$parameter_file"
)

az deployment sub what-if "${parameters[@]}" --no-pretty-print
az deployment sub create "${parameters[@]}"
