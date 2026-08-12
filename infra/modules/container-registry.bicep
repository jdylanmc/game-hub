targetScope = 'resourceGroup'

metadata description = 'Creates the private API image registry and its pull-only managed identity boundary.'

@description('Azure Container Registry resource name.')
param name string

@description('User-assigned managed identity name used only for registry image pulls.')
param imagePullIdentityName string

@description('Azure region for the registry and managed identity.')
param location string

@description('Required environment tags.')
param tags object

@description('Repository name used for the Game Hub API image.')
@minLength(1)
param apiImageRepository string

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource imagePullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: imagePullIdentityName
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    dataEndpointEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource imagePullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, imagePullIdentity.id, acrPullRoleDefinitionId)
  scope: registry
  properties: {
    principalId: imagePullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

@description('Azure Container Registry resource identifier.')
output id string = registry.id

@description('Azure Container Registry resource name.')
output registryName string = registry.name

@description('Azure Container Registry login server.')
output loginServer string = registry.properties.loginServer

@description('Private image repository reserved for API publication.')
output apiImageRepository string = '${registry.properties.loginServer}/${apiImageRepository}'

@description('Pull-only user-assigned managed identity resource identifier.')
output imagePullIdentityId string = imagePullIdentity.id

@description('Pull-only user-assigned managed identity client identifier.')
output imagePullIdentityClientId string = imagePullIdentity.properties.clientId

@description('Pull-only user-assigned managed identity principal identifier.')
output imagePullIdentityPrincipalId string = imagePullIdentity.properties.principalId

@description('Deterministic AcrPull role assignment identifier.')
output imagePullRoleAssignmentId string = imagePullRoleAssignment.id
