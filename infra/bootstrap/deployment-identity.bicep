targetScope = 'resourceGroup'

metadata description = 'Creates one keyless GitHub deployment identity for a protected Game Hub environment.'

@description('Managed identity name.')
param identityName string

@description('Immutable GitHub environment subject trusted by this identity.')
param federatedSubject string

@description('Deployment environment represented by the federated credential.')
param environmentName string

@description('Azure region for the managed identity.')
param location string

@description('Required non-secret tags.')
param tags object

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource deploymentFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-${environmentName}'
  parent: deploymentIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: federatedSubject
  }
}

@description('Managed identity resource identifier.')
output id string = deploymentIdentity.id

@description('Managed identity client identifier used by GitHub OpenID Connect.')
output clientId string = deploymentIdentity.properties.clientId

@description('Managed identity principal identifier used for role assignments.')
output principalId string = deploymentIdentity.properties.principalId

@description('Federated credential resource identifier.')
output federatedCredentialId string = deploymentFederatedCredential.id
