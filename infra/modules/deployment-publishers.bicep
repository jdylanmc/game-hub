targetScope = 'resourceGroup'

metadata description = 'Creates keyless, least-privilege frontend and API publication identities.'

@description('Deployment environment represented by the federated credentials.')
param environmentName string

@description('Immutable GitHub environment subject trusted by the publisher identities.')
param federatedSubject string

@description('Frontend publisher managed identity name.')
param frontendPublisherIdentityName string

@description('API publisher managed identity name.')
param apiPublisherIdentityName string

@description('Azure Static Web Apps resource name.')
param staticWebAppName string

@description('Azure Container Registry resource name.')
param containerRegistryName string

@description('Azure Container App resource name.')
param containerAppName string

@description('Azure Front Door profile name.')
param frontDoorProfileName string

@description('Existing asset publisher managed identity name.')
param assetPublisherIdentityName string

@description('Existing secure-configuration publisher managed identity name.')
param configurationPublisherIdentityName string

@description('Azure region for the managed identities.')
param location string

@description('Required non-secret tags.')
param tags object

var readerRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'acdd72a7-3385-48ef-bd42-f606fba81ae7'
)
var contributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b24988ac-6180-42a0-ab88-20f7382dd24c'
)
var acrPushRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '8311e382-0749-4cb8-b61a-304f252e45ec'
)

resource frontendPublisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: frontendPublisherIdentityName
  location: location
  tags: tags
}

resource frontendPublisherFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-${environmentName}'
  parent: frontendPublisherIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: federatedSubject
  }
}

resource apiPublisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: apiPublisherIdentityName
  location: location
  tags: tags
}

resource apiPublisherFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-${environmentName}'
  parent: apiPublisherIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: federatedSubject
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' existing = {
  name: staticWebAppName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: containerRegistryName
}

resource containerApp 'Microsoft.App/containerApps@2025-01-01' existing = {
  name: containerAppName
}

resource frontDoorProfile 'Microsoft.Cdn/profiles@2025-01-01-preview' existing = {
  name: frontDoorProfileName
}

resource assetPublisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: assetPublisherIdentityName
}

resource secretPublisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: configurationPublisherIdentityName
}

resource frontendReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, frontendPublisherIdentity.id, readerRoleDefinitionId)
  properties: {
    principalId: frontendPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleDefinitionId
  }
}

resource frontendContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(staticWebApp.id, frontendPublisherIdentity.id, contributorRoleDefinitionId)
  scope: staticWebApp
  properties: {
    principalId: frontendPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleDefinitionId
  }
}

resource apiReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, apiPublisherIdentity.id, readerRoleDefinitionId)
  properties: {
    principalId: apiPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleDefinitionId
  }
}

resource apiRegistryPushRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, apiPublisherIdentity.id, acrPushRoleDefinitionId)
  scope: containerRegistry
  properties: {
    principalId: apiPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPushRoleDefinitionId
  }
}

resource apiContainerAppContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerApp.id, apiPublisherIdentity.id, contributorRoleDefinitionId)
  scope: containerApp
  properties: {
    principalId: apiPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleDefinitionId
  }
}

resource assetReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, assetPublisherIdentity.id, readerRoleDefinitionId)
  properties: {
    principalId: assetPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleDefinitionId
  }
}

resource assetFrontDoorContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(frontDoorProfile.id, assetPublisherIdentity.id, contributorRoleDefinitionId)
  scope: frontDoorProfile
  properties: {
    principalId: assetPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleDefinitionId
  }
}

resource secretPublisherReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, secretPublisherIdentity.id, readerRoleDefinitionId)
  properties: {
    principalId: secretPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleDefinitionId
  }
}

@description('Non-secret keyless publication identity contract.')
output configuration object = {
  api: {
    clientId: apiPublisherIdentity.properties.clientId
    containerAppContributorRoleAssignmentId: apiContainerAppContributorRoleAssignment.id
    federatedCredentialId: apiPublisherFederatedCredential.id
    id: apiPublisherIdentity.id
    principalId: apiPublisherIdentity.properties.principalId
    readerRoleAssignmentId: apiReaderRoleAssignment.id
    registryPushRoleAssignmentId: apiRegistryPushRoleAssignment.id
  }
  asset: {
    frontDoorContributorRoleAssignmentId: assetFrontDoorContributorRoleAssignment.id
    readerRoleAssignmentId: assetReaderRoleAssignment.id
  }
  federatedSubject: federatedSubject
  frontend: {
    clientId: frontendPublisherIdentity.properties.clientId
    contributorRoleAssignmentId: frontendContributorRoleAssignment.id
    federatedCredentialId: frontendPublisherFederatedCredential.id
    id: frontendPublisherIdentity.id
    principalId: frontendPublisherIdentity.properties.principalId
    readerRoleAssignmentId: frontendReaderRoleAssignment.id
  }
  secureConfiguration: {
    readerRoleAssignmentId: secretPublisherReaderRoleAssignment.id
  }
}
