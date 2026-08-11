# GitHub Actions OIDC Setup for Adversarial Agent Infrastructure

This document describes how to configure OpenID Connect (OIDC) authentication between GitHub Actions and Azure for the adversarial agent infrastructure.

## Overview

GitHub Actions uses OpenID Connect (OIDC) to authenticate with Azure without storing long-lived credentials in repository secrets. This is more secure than service principal authentication because:

1. **No stored secrets**: Credentials are derived from GitHub's OIDC token (valid for 5 minutes)
2. **Short-lived tokens**: Each workflow run gets a unique, time-limited token
3. **Fine-grained permissions**: Can limit OIDC principal to specific repos, branches, environments, or run conditions
4. **Audit trail**: All authentications appear in Azure activity logs

## Prerequisites

- Azure CLI authenticated with appropriate permissions (must be able to create App Registrations and role assignments)
- GitHub CLI (`gh`) authenticated with repository `admin:org_hook` scope for the game-hub repository
- Access to the Azure subscription: `11213dbd-39fe-46ba-87db-5f5e8c449aed`

## Setup Steps

### 1. Create Azure App Registration

```bash
# Create an app registration for GitHub Actions
az ad app create --display-name "game-hub-github-actions"

# Get the app's object ID (needed for role assignments)
APP_ID=$(az ad app list --display-name "game-hub-github-actions" --query "[0].id" -o tsv)
echo "App ID: $APP_ID"

# Create a service principal for the app
az ad sp create --id "$APP_ID"
SP_ID=$(az ad sp list --display-name "game-hub-github-actions" --query "[0].id" -o tsv)
echo "Service Principal ID: $SP_ID"
```

### 2. Configure OIDC Trust Relationship

```bash
# Add GitHub as a federated credential issuer
# This tells Azure to trust tokens issued by GitHub for this repository

GITHUB_OWNER="jdylanmc"
GITHUB_REPO="game-hub"

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters '{
    "name": "github-oidc-prod",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"${GITHUB_OWNER}/${GITHUB_REPO}"':ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"],
    "description": "Authorize GitHub Actions for production deployments from main branch"
  }'

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters '{
    "name": "github-oidc-pr",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"${GITHUB_OWNER}/${GITHUB_REPO}"':pull_request",
    "audiences": ["api://AzureADTokenExchange"],
    "description": "Authorize GitHub Actions for PR validation deployments"
  }'
```

### 3. Grant Azure Role Permissions

```bash
# The app needs permissions to deploy resources to the resource groups

SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"

# Grant Contributor role on resource groups (scoped deployment)
az role assignment create \
  --assignee "$SP_ID" \
  --role Contributor \
  --scope "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/game-hub-adversarial-agents-prod"

az role assignment create \
  --assignee "$SP_ID" \
  --role Contributor \
  --scope "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/game-hub-adversarial-agents-test"

# Alternatively, use a custom role for more restrictive permissions
# This limits to only creating/modifying OpenAI, Key Vault, and monitoring resources
```

### 4. Configure GitHub Actions Workflow

In `.github/workflows/deploy-adversarial-infrastructure.yml`:

```yaml
name: Deploy Adversarial Infrastructure

on:
  workflow_dispatch:
    inputs:
      environment:
        required: true
        type: choice
        options: [prod, test]
        default: test
  push:
    branches: [main]
    paths:
      - 'infra/**'
      - '.github/workflows/deploy-*.yml'

permissions:
  contents: read
  id-token: write  # Required for OIDC

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment || 'test' }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Azure Login (OIDC)
        uses: azure/login@v1
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
          enable-AzPSSession: false
      
      - name: Deploy Infrastructure
        run: ./infra/deploy.sh ${{ inputs.environment || 'test' }}
        env:
          GITHUB_REPOSITORY: ${{ github.repository }}
```

### 5. Store GitHub Actions Secrets

These are required for the OIDC authentication. They are NOT the API keys, so they are safe to commit as public GitHub environment secrets.

```bash
# Get the app registration and subscription details
APP_CLIENT_ID=$(az ad app list --display-name "game-hub-github-actions" --query "[0].appId" -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"

# Set as GitHub repository secrets (these are safe to make public)
gh secret set AZURE_CLIENT_ID --body "$APP_CLIENT_ID" --org jdylanmc
gh secret set AZURE_TENANT_ID --body "$TENANT_ID" --org jdylanmc
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID" --org jdylanmc

# Or per-environment (better for separation of concerns)
gh secret set AZURE_CLIENT_ID --body "$APP_CLIENT_ID" --env prod
gh secret set AZURE_TENANT_ID --body "$TENANT_ID" --env prod
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID" --env prod
```

### 6. Verify OIDC Configuration

```bash
# Test the OIDC configuration by running a test workflow
gh workflow run deploy-adversarial-infrastructure.yml \
  -f environment=test \
  -r main

# Monitor the deployment
gh run list --workflow=deploy-adversarial-infrastructure.yml --limit=1

# View detailed logs
gh run view --log <run-id>
```

## Key Vault and Secret Retrieval

The Bicep deployment stores OpenAI credentials in Azure Key Vault. GitHub Actions can retrieve these using:

```bash
# Retrieve from Key Vault during deployment
OPENAI_KEY=$(az keyvault secret show --vault-name game-hub-adversarial-kv-prod --name openai-key --query value -o tsv)

# Use in GitHub Actions environment
echo "AZURE_OPENAI_KEY=$OPENAI_KEY" >> $GITHUB_ENV
```

## Troubleshooting

### "Insufficient permissions" error during login

**Cause**: The app registration doesn't have enough permissions in Azure.

**Solution**: Verify the app was granted `Contributor` role on the resource groups:
```bash
az role assignment list --assignee <service-principal-id> --scope /subscriptions/<subscription-id>
```

### "Invalid federated credential" error

**Cause**: The federated credential subject doesn't match the GitHub workflow context.

**Solution**: Verify the subject format matches your repository:
- Main branch: `repo:OWNER/REPO:ref:refs/heads/main`
- Pull requests: `repo:OWNER/REPO:pull_request`
- Specific environment: `repo:OWNER/REPO:environment:ENVIRONMENT_NAME`

### Cannot retrieve secrets from Key Vault

**Cause**: The GitHub Actions identity doesn't have Key Vault read permissions.

**Solution**: Grant the service principal `Key Vault Secrets Officer` role:
```bash
az role assignment create \
  --assignee <service-principal-id> \
  --role "Key Vault Secrets Officer" \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>
```

## References

- [GitHub Actions: Using OIDC with Azure](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Azure: Configure Federated Credentials for GitHub Actions](https://docs.microsoft.com/en-us/azure/developer/github/connect-from-azure-federated-identity)
- [Bicep Deployments from GitHub Actions](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deploy-github-actions)
