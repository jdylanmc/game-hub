# Adversarial Agent Infrastructure

This directory contains the Azure infrastructure provisioning for the game-hub adversarial unit test reviewer.

## Overview

The adversarial agent infrastructure deploys Azure OpenAI Service (GPT-4 Turbo) on a consumption-based capacity model to:

- Review pull requests for weak unit tests
- Provide automated, deterministic feedback
- Scale with bounded concurrency (configurable per environment)
- Stay within monthly cost targets ($100 USD for production)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  GitHub Actions Workflow                      │
│                  (Deploy on trigger)                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    OIDC Authentication                        │
│         (No stored secrets, 5-minute token lifetime)          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Azure Resource Group Deployment                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Azure OpenAI Service (GPT-4 Turbo)                  │    │
│  │  - Consumption-based capacity                       │    │
│  │  - Max 3 concurrent reviews                         │    │
│  │  - Auto-scaling per load                            │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Azure Key Vault                                     │    │
│  │  - OpenAI endpoint & API key                        │    │
│  │  - Automatic secret rotation                        │    │
│  │  - Role-based access (least privilege)              │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Azure Monitor & Alerting                            │    │
│  │  - Token consumption metrics                        │    │
│  │  - Budget alerts ($100/month threshold)             │    │
│  │  - Error tracking and diagnostics                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `bicep/main.bicep` | Declarative infrastructure template (idempotent) |
| `prod.bicepparam` | Production environment parameters (3 concurrent, $100 budget) |
| `test.bicepparam` | Test environment parameters (1 concurrent, $20 budget) |
| `deploy.sh` | Bash deployment automation script |
| `OIDC_SETUP.md` | GitHub Actions OIDC trust relationship configuration |
| `README.md` | This file |

## Prerequisites

### Local Development

- **Azure CLI** (`az`) — v2.50.0+
- **Bicep CLI** — included with Azure CLI >= 2.31.0
- **jq** — for JSON parsing in deploy.sh
- **Bash** — v4.0+ (for deploy.sh)
- **GitHub CLI** (`gh`) — optional, for secret configuration

### Azure Subscription

- **Subscription ID**: `11213dbd-39fe-46ba-87db-5f5e8c449aed`
- **Region**: East US (supports Azure OpenAI Service)
- **Required Permissions**: 
  - `Microsoft.CognitiveServices/accounts/*` — create/manage OpenAI services
  - `Microsoft.KeyVault/vaults/*` — manage Key Vault for secret storage
  - `Microsoft.Insights/*` — create monitoring and alerts
  - `Microsoft.Authorization/roleAssignments/*` — manage RBAC

### GitHub Configuration

- **OIDC Trust**: Federated credentials configured (see OIDC_SETUP.md)
- **Repository Secrets**: 
  - `AZURE_CLIENT_ID` — App registration client ID
  - `AZURE_TENANT_ID` — Azure AD tenant ID
  - `AZURE_SUBSCRIPTION_ID` — Azure subscription ID
- **Workflow Permissions**: `contents: read`, `id-token: write`

## Deployment

### Quick Start (Interactive)

```bash
# Deploy to test environment
./infra/deploy.sh test

# Deploy to production
./infra/deploy.sh prod
```

### Automated Deployment (GitHub Actions)

The workflow `.github/workflows/deploy-adversarial-infrastructure.yml` automatically deploys when:

1. **Manual trigger**: `workflow_dispatch` with environment choice
2. **Infrastructure changes**: Any commit to `infra/**` on main branch
3. **Workflow changes**: Updates to the deployment workflow itself

#### Trigger Manual Deployment

```bash
gh workflow run deploy-adversarial-infrastructure.yml \
  -f environment=prod \
  -r main
```

#### View Deployment Status

```bash
gh run list --workflow=deploy-adversarial-infrastructure.yml --limit=5
gh run view <run-id> --log
```

## Idempotency Guarantees

The Bicep deployment is fully idempotent:

- **Resources are declarative**: Reapplying the same template converges to the desired state
- **No duplicates**: Existing resources are updated in-place, never recreated
- **State tracking**: Azure maintains resource state independently of deployment runs
- **Versioning**: Resources are tagged with deployment metadata for auditing

## Cost Management

### Budget Targets

| Environment | Max Concurrent | Monthly Budget |
|-------------|----------------|-----------------|
| prod | 3 | $100 USD |
| test | 1 | $20 USD |

### Cost Drivers

1. **Prompt tokens**: Text input to GPT-4 Turbo (~$0.01 per 1K tokens)
2. **Completion tokens**: Model output (~$0.03 per 1K tokens)
3. **Request volume**: Number of reviews per day

### Cost Optimization

- **Consumption model**: Pay only for tokens used; no pre-allocated quotas
- **Concurrency limits**: Prevents runaway usage from buggy workflows
- **Token budgeting**: Prompt engineering constrains context size
- **Alerts**: Email/webhook triggers when usage exceeds thresholds

### Monitoring Costs

```bash
# View OpenAI service metrics
az monitor metrics list \
  --resource-group game-hub-adversarial-agents-prod \
  --resource-type Microsoft.CognitiveServices/accounts \
  --resource game-hub-adversarial-openai \
  --metric "Tokens Used"

# View billing in Azure portal
# https://portal.azure.com/ → Cost Management + Billing → Cost Analysis
```

## Configuration

### Environment Variables

Use environment-specific parameter files to configure:

- `resourceGroupName` — Azure resource group name
- `location` — Azure region
- `environment` — env name (prod/test)
- `maxConcurrentReviews` — max parallel reviews
- `monthlyBudgetUsd` — budget alert threshold

### Customization

Edit `infra/{prod,test}.bicepparam` to adjust parameters:

```bicepparam
param maxConcurrentReviews = 5  // Increase for higher concurrency
param monthlyBudgetUsd = 200     // Increase budget limit
param location = 'westus3'       // Change region if needed
```

## Troubleshooting

### "Permission denied" during deployment

**Issue**: User lacks permissions to deploy resources.

**Solution**: 
```bash
# Verify subscription access
az account show

# Request appropriate Azure roles (Contributor or custom role)
# Contact Azure subscription owner for access
```

### "Insufficient quota" error

**Issue**: Azure OpenAI quota exhausted in region.

**Solution**:
```bash
# Check quota in current region
az cognitiveservices account list \
  --resource-group game-hub-adversarial-agents-prod

# Request quota increase via Azure portal
# Or deploy to different region (change location in .bicepparam)
```

### "Invalid federated credential" during GitHub Actions

**Issue**: OIDC trust relationship not configured correctly.

**Solution**: Re-run OIDC setup (see OIDC_SETUP.md):
```bash
# Verify federated credentials
az ad app federated-credential list --id <app-id>

# Recreate if needed
az ad app federated-credential create \
  --id <app-id> \
  --parameters '{
    "name": "github-oidc-prod",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:jdylanmc/game-hub:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### "Key Vault access denied" in workflow

**Issue**: GitHub Actions identity doesn't have Key Vault permissions.

**Solution**:
```bash
# Grant Key Vault Secrets Officer role to the service principal
az role assignment create \
  --assignee <service-principal-id> \
  --role "Key Vault Secrets Officer" \
  --scope /subscriptions/<subscription-id>/resourceGroups/game-hub-adversarial-agents-prod
```

## Validation

### Local Validation

```bash
# Validate Bicep syntax
az bicep build-params --file infra/prod.bicepparam

# Dry-run deployment (what-if)
az deployment group what-if \
  --resource-group game-hub-adversarial-agents-prod \
  --template-file infra/bicep/main.bicep \
  --parameters infra/prod.bicepparam
```

### Deployed Resource Verification

```bash
# List all deployed resources
az resource list \
  --resource-group game-hub-adversarial-agents-prod \
  -o table

# Verify OpenAI service
az cognitiveservices account show \
  --resource-group game-hub-adversarial-agents-prod \
  --name game-hub-adversarial-openai \
  --query "{name:name, status:properties.statuses[0], endpoint:properties.endpoint}"

# Test API connectivity (requires API key from Key Vault)
ENDPOINT=$(az cognitiveservices account show \
  --resource-group game-hub-adversarial-agents-prod \
  --name game-hub-adversarial-openai \
  --query properties.endpoint -o tsv)

curl -X GET "$ENDPOINT/openai/models?api-version=2024-02-15-preview" \
  -H "api-key: $OPENAI_KEY"
```

## Security Considerations

### Secrets Management

- **API Keys** are stored in Azure Key Vault, NOT in GitHub secrets
- **No secrets in repo**: All credentials are external, dynamically retrieved
- **Rotation**: Keys can be rotated in Key Vault without redeployment
- **Audit trail**: All API access is logged in Key Vault

### Access Control

- **OIDC authentication**: 5-minute token lifetime, no long-lived credentials
- **Least privilege**: Service principal has Contributor role only on resource groups
- **GitHub Actions**: Federated credentials scoped to specific branches/environments
- **RBAC**: All Azure role assignments use principal-based access

### Network Security

- **Public endpoint**: OpenAI service is accessible from any IP (by default)
- **Future hardening**: Virtual networks and private endpoints can be added
- **API versioning**: Uses stable API version (2024-02-15-preview)

## References

- [Azure Bicep Documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/overview)
- [GitHub Actions: OIDC with Azure](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Azure Key Vault Security](https://learn.microsoft.com/en-us/azure/key-vault/general/security-overview)

## Support

For infrastructure-related issues:

1. Check deployment logs: `.github/workflows/deploy-adversarial-infrastructure.yml` runs
2. Review Azure Activity Log in portal
3. Check Key Vault diagnostics for secret retrieval failures
4. Consult OIDC_SETUP.md for authentication issues
5. File GitHub issue with error details and workflow run ID
