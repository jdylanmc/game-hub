#!/usr/bin/env bash
# Adversarial Agent Infrastructure Deployment Script
# Deploys Azure resources for game-hub unit test reviewer using Bicep
# 
# Usage:
#   ./infra/deploy.sh prod    # Deploy to production
#   ./infra/deploy.sh test    # Deploy to test environment
#
# Prerequisites:
#   - Azure CLI installed and authenticated
#   - Bicep CLI (installed with Azure CLI >= 2.31.0)
#   - Appropriate Azure subscription access
#   - GitHub repository write access (for secret configuration)

set -euo pipefail

ENVIRONMENT="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(prod|test)$ ]]; then
    echo "Error: Invalid environment '$ENVIRONMENT'. Must be 'prod' or 'test'." >&2
    exit 1
fi

# Configuration per environment
case "$ENVIRONMENT" in
    prod)
        SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"
        PARAM_FILE="${SCRIPT_DIR}/prod.bicepparam"
        RG_NAME="game-hub-adversarial-agents-prod"
        ;;
    test)
        SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"
        PARAM_FILE="${SCRIPT_DIR}/test.bicepparam"
        RG_NAME="game-hub-adversarial-agents-test"
        ;;
esac

echo "════════════════════════════════════════════════════════════════"
echo "Adversarial Agent Infrastructure Deployment"
echo "════════════════════════════════════════════════════════════════"
echo "Environment: $ENVIRONMENT"
echo "Subscription: $SUBSCRIPTION_ID"
echo "Resource Group: $RG_NAME"
echo "Parameter File: $PARAM_FILE"
echo

# Set subscription
echo "Setting Azure subscription..."
az account set --subscription "$SUBSCRIPTION_ID"
ACCOUNT_NAME=$(az account show --query name -o tsv)
echo "✓ Authenticated as: $ACCOUNT_NAME"
echo

# Validate Bicep
echo "Validating Bicep template..."
az bicep build-params --file "$PARAM_FILE" --outdir "${SCRIPT_DIR}" 2>&1 | head -20 || {
    echo "Error: Bicep validation failed. Ensure 'az bicep' is installed." >&2
    exit 1
}
echo "✓ Bicep template valid"
echo

# Create or verify resource group exists
echo "Ensuring resource group exists..."
az group create --name "$RG_NAME" --location eastus --tags \
    project=game-hub \
    component=adversarial-agents \
    environment="$ENVIRONMENT" \
    managedBy=bicep \
    createdBy=deployment-script \
    createdAt="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "✓ Resource group ready: $RG_NAME"
echo

# Deploy infrastructure (idempotent)
echo "Deploying infrastructure (this may take 2-5 minutes)..."
echo

# Use what-if first to show what will change
echo "Running what-if analysis..."
az deployment group what-if \
    --resource-group "$RG_NAME" \
    --template-file "${SCRIPT_DIR}/bicep/main.bicep" \
    --parameters "$PARAM_FILE" \
    --no-pretty-print || true
echo

# Perform actual deployment
DEPLOYMENT_ID="adversarial-agents-$(date +%s)"
DEPLOYMENT_OUTPUT=$(az deployment group create \
    --resource-group "$RG_NAME" \
    --template-file "${SCRIPT_DIR}/bicep/main.bicep" \
    --parameters "$PARAM_FILE" \
    --deployment-name "$DEPLOYMENT_ID" \
    --query properties.outputs \
    -o json)

echo "✓ Infrastructure deployed successfully"
echo

# Extract outputs
OPENAI_ENDPOINT=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.openaiEndpoint.value')
KEYVAULT_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.keyVaultName.value')
MODEL_DEPLOYMENT_ID=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.modelDeploymentId.value')
MAX_CONCURRENT=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.maxConcurrentReviews.value')
BUDGET=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.monthlyBudgetUsd.value')

echo "════════════════════════════════════════════════════════════════"
echo "Deployment Outputs"
echo "════════════════════════════════════════════════════════════════"
echo "OpenAI Endpoint:       $OPENAI_ENDPOINT"
echo "Key Vault Name:        $KEYVAULT_NAME"
echo "Model Deployment ID:   $MODEL_DEPLOYMENT_ID"
echo "Max Concurrent Reviews: $MAX_CONCURRENT"
echo "Monthly Budget (USD):  \$$BUDGET"
echo

# Retrieve secrets and configure GitHub Actions
if command -v gh &>/dev/null && [ -n "${GITHUB_REPOSITORY:-}" ]; then
    echo "════════════════════════════════════════════════════════════════"
    echo "Configuring GitHub Actions Secrets"
    echo "════════════════════════════════════════════════════════════════"
    
    # Retrieve from Key Vault (requires appropriate RBAC permissions)
    echo "Retrieving secrets from Key Vault..."
    OPENAI_KEY=$(az keyvault secret show --vault-name "$KEYVAULT_NAME" --name openai-key --query value -o tsv 2>/dev/null || echo "")
    
    if [ -z "$OPENAI_KEY" ]; then
        echo "⚠ Warning: Could not retrieve OpenAI API key from Key Vault."
        echo "  Run this manually:"
        echo "  OPENAI_KEY=\$(az keyvault secret show --vault-name $KEYVAULT_NAME --name openai-key --query value -o tsv)"
        echo "  gh secret set ADVERSARIAL_OPENAI_ENDPOINT --body \"$OPENAI_ENDPOINT\""
        echo "  gh secret set ADVERSARIAL_OPENAI_KEY --body \"\$OPENAI_KEY\""
        echo "  gh secret set ADVERSARIAL_OPENAI_DEPLOYMENT_ID --body \"$MODEL_DEPLOYMENT_ID\""
    else
        # Set GitHub repository secrets (requires GH CLI auth)
        gh secret set ADVERSARIAL_OPENAI_ENDPOINT --body "$OPENAI_ENDPOINT" || true
        gh secret set ADVERSARIAL_OPENAI_KEY --body "$OPENAI_KEY" || true
        gh secret set ADVERSARIAL_OPENAI_DEPLOYMENT_ID --body "$MODEL_DEPLOYMENT_ID" || true
        echo "✓ GitHub Actions secrets configured"
    fi
    echo
fi

echo "════════════════════════════════════════════════════════════════"
echo "Deployment Complete"
echo "════════════════════════════════════════════════════════════════"
echo "Next steps:"
echo "1. Verify Azure resources in Resource Group: $RG_NAME"
echo "2. Configure GitHub Actions OIDC trust (see infra/OIDC_SETUP.md)"
echo "3. Test with: az cognitiveservices account keys list -g $RG_NAME -n game-hub-adversarial-openai${ENVIRONMENT%-prod}"
echo
