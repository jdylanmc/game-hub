#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT="${1:-}"
REVIEWER_PRINCIPAL_ID="${AZURE_REVIEWER_PRINCIPAL_ID:-}"
SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! "$ENVIRONMENT" =~ ^(prod|test)$ ]]; then
  echo "Usage: AZURE_REVIEWER_PRINCIPAL_ID=<object-id> ./infra/deploy.sh <prod|test>" >&2
  exit 1
fi

if [[ -z "$REVIEWER_PRINCIPAL_ID" ]]; then
  echo "AZURE_REVIEWER_PRINCIPAL_ID is required for a deployable role assignment." >&2
  exit 1
fi

az account set --subscription "$SUBSCRIPTION_ID"
az bicep install --version v0.42.1

for parameter_file in "$SCRIPT_DIR"/*.bicepparam; do
  az bicep build-params --file "$parameter_file" --stdout > /dev/null
done

deployment_name="adversarial-${ENVIRONMENT}-$(date -u +%Y%m%d%H%M%S)"
parameters=(
  --location eastus
  --name "$deployment_name"
  --template-file "$SCRIPT_DIR/bicep/main.bicep"
  --parameters "$SCRIPT_DIR/${ENVIRONMENT}.bicepparam"
  --parameters "reviewerPrincipalId=$REVIEWER_PRINCIPAL_ID"
)

az deployment sub what-if "${parameters[@]}" --no-pretty-print
az deployment sub create "${parameters[@]}"
