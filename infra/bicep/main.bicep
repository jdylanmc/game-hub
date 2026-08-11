targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Resource group for the environment.')
param resourceGroupName string

@description('Azure region that supports the approved model.')
param location string = 'eastus'

@allowed([
  'test'
  'prod'
])
@description('Deployment environment.')
param environment string

@minValue(1)
@maxValue(99)
@description('Monthly Azure Consumption budget in US dollars.')
param monthlyBudgetUsd int

@minLength(1)
@description('Email recipients for actual and forecast budget alerts.')
param budgetContactEmails array

@description('Object ID of the protected-environment identity used for model inference. Leave empty only for build validation.')
param reviewerPrincipalId string = ''

@description('Resource naming prefix.')
param resourceNamePrefix string = 'game-hub-adversarial'

@description('Azure OpenAI deployment name.')
param modelDeploymentId string = 'game-hub-unit-test-reviewer'

@description('Budget start date. Defaults to the first day of the deployment month.')
param budgetStartDate string = utcNow('yyyy-MM-01')

var commonTags = {
  project: 'game-hub'
  component: 'adversarial-agents'
  environment: environment
  purpose: 'pull-request-review'
  managedBy: 'bicep'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

module inference './resources.bicep' = {
  name: 'adversarial-inference-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    modelDeploymentId: modelDeploymentId
    resourceNamePrefix: resourceNamePrefix
    reviewerPrincipalId: reviewerPrincipalId
    tags: commonTags
  }
}

resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: '${resourceNamePrefix}-${environment}-monthly'
  properties: {
    amount: monthlyBudgetUsd
    category: 'Cost'
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
      endDate: '2036-12-31'
    }
    filter: {
      dimensions: {
        name: 'ResourceGroupName'
        operator: 'In'
        values: [
          resourceGroupName
        ]
      }
    }
    notifications: {
      Actual80Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
      Forecast100Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
      Actual100Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
    }
  }
}

output resourceGroupName string = resourceGroup.name
output openaiEndpoint string = inference.outputs.openaiEndpoint
output modelDeploymentId string = inference.outputs.modelDeploymentId
output modelName string = inference.outputs.modelName
output modelVersion string = inference.outputs.modelVersion
output modelSku string = inference.outputs.modelSku
output budgetName string = budget.name
