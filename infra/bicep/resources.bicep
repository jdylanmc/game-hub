@allowed([
  'test'
  'prod'
])
param environment string
param location string
param resourceNamePrefix string
param modelDeploymentId string
param reviewerPrincipalId string
param tags object

var resourceSuffix = environment == 'prod' ? '' : '-${environment}'
var accountName = '${resourceNamePrefix}-openai${resourceSuffix}'
var modelName = 'gpt-4.1-mini'
var modelVersion = '2025-04-14'
var modelSku = 'GlobalStandard'
var cognitiveServicesOpenAIUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
)

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  tags: tags
  properties: {
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: modelDeploymentId
  sku: {
    name: modelSku
    capacity: 500
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

resource reviewerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(reviewerPrincipalId)) {
  name: guid(account.id, reviewerPrincipalId, cognitiveServicesOpenAIUserRoleId)
  scope: account
  properties: {
    principalId: reviewerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesOpenAIUserRoleId
  }
}

output openaiEndpoint string = account.properties.endpoint
output modelDeploymentId string = deployment.name
output modelName string = modelName
output modelVersion string = modelVersion
output modelSku string = modelSku
