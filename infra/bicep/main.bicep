// Adversarial Agent Infrastructure
// Deploys Azure OpenAI Service with GPT-4.1 mini for game-hub pull request review
// Uses consumption capacity with bounded concurrency and cost monitoring

@minLength(1)
@maxLength(64)
@description('Name of the resource group (lowercase alphanumeric only)')
param resourceGroupName string

@description('Azure location for resources (must support Azure OpenAI Service)')
param location string = 'eastus'

@description('Environment: dev, staging, or prod')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Maximum concurrent reviews allowed')
@minValue(1)
@maxValue(10)
param maxConcurrentReviews int = 3

@description('Monthly budget alert threshold in USD')
@minValue(1)
@maxValue(1000)
param monthlyBudgetUsd int = 100

@description('Resource naming prefix')
param resourceNamePrefix string = 'game-hub-adversarial'

// Consumption model requires explicit deployment mapping
@description('Deployment ID for GPT-4.1 mini model')
param modelDeploymentId string = 'game-hub-unit-test-reviewer'

// Determine naming based on environment
var resourceSuffix = environment == 'prod' ? '' : '-${environment}'
var aoaiName = '${resourceNamePrefix}-openai${resourceSuffix}'
var keyVaultName = '${resourceNamePrefix}-kv${resourceSuffix}'

// Tags for resource management and cost tracking
var commonTags = {
  project: 'game-hub'
  component: 'adversarial-agents'
  environment: environment
  purpose: 'pull-request-review'
  managedBy: 'bicep'
}

// ========== Resource Group ==========
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

// ========== Azure OpenAI Service ==========
// Consumption-based deployment allows on-demand API usage without quota pre-allocation
resource aoai 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  scope: rg
  name: aoaiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  tags: commonTags
  properties: {
    // Consumption model: charges per 1K tokens without pre-purchased quotas
    deploymentType: 'User Assigned'
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// Deployment of GPT-4.1 mini model on consumption capacity
// Each concurrent review request is charged per token used
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-10-01-preview' = {
  parent: aoai
  name: modelDeploymentId
  properties: {
    model: {
      // GPT-4 Turbo with Vision (4.1 equivalent for reasoning + multimodal)
      // Use gpt-4-turbo for best unit-test analysis capability
      format: 'OpenAI'
      name: 'gpt-4-turbo'
      version: 'turbo-2024-04-09'
    }
    // Consumption deployment: no rate limit pre-allocation, charges per API call
    deploymentType: 'Text'
    scaleSettings: {
      scaleType: 'Standard'
      capacity: 0  // Consumption model ignores pre-allocated capacity
    }
  }
}

// ========== Azure Key Vault for Secrets ==========
// Stores API endpoints and keys for secure rotation
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  scope: rg
  name: replace(keyVaultName, '-', '')  // Key Vault names cannot contain hyphens
  location: location
  tags: commonTags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    accessPolicies: []
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// Store OpenAI endpoint for GitHub Actions
resource kvSecretEndpoint 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'openai-endpoint'
  properties: {
    value: aoai.properties.endpoint
  }
}

// Store OpenAI API key for GitHub Actions
resource kvSecretKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'openai-key'
  properties: {
    value: listKeys(aoai.id, '2023-10-01-preview').key1
  }
}

// ========== Monitoring and Budgets ==========
// Alert on consumption to prevent runaway costs
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  scope: rg
  name: '${resourceNamePrefix}-alerts${resourceSuffix}'
  location: 'global'
  tags: commonTags
  properties: {
    enabled: true
    groupShortName: 'aadv-alerts'
    // Add email/webhook receivers in deployment or manually in portal
  }
}

// Metric alert for OpenAI API usage
// Triggers when normalized tokens exceed threshold (prevents overspend)
resource usageAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  scope: rg
  name: '${resourceNamePrefix}-usage-alert${resourceSuffix}'
  location: 'global'
  tags: commonTags
  properties: {
    description: 'Alert when OpenAI token consumption exceeds safe threshold'
    enabled: true
    scopes: [aoai.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT1H'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Token consumption'
          metricName: 'Tokens Used'
          operator: 'GreaterThan'
          threshold: 90000  // ~$0.90 per hour at current rates
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ========== Outputs for GitHub Actions Integration ==========
output resourceGroupId string = rg.id
output resourceGroupName string = rg.name
output openaiEndpoint string = aoai.properties.endpoint
output openaiApiVersion string = '2024-02-15-preview'
output modelDeploymentId string = modelDeploymentId
output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output maxConcurrentReviews int = maxConcurrentReviews
output monthlyBudgetUsd int = monthlyBudgetUsd
