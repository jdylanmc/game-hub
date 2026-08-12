targetScope = 'resourceGroup'

metadata description = 'Creates the per-environment Key Vault and least-privilege managed identities for runtime secret references.'

@description('Azure Key Vault name.')
param keyVaultName string

@description('User-assigned managed identity name used only by the API runtime.')
param apiRuntimeIdentityName string

@description('User-assigned managed identity name used only to publish secure configuration.')
param configurationPublisherIdentityName string

@description('System-assigned Static Web Apps principal that reads the External ID client certificate.')
param frontendPrincipalId string

@description('Deployment environment represented by the federated credential.')
param environmentName string

@description('Immutable GitHub subject allowed to publish secure configuration.')
param configurationPublisherFederatedSubject string

@description('Azure region for the vault and managed identities.')
param location string

@description('Required environment tags.')
param tags object

@description('Days that deleted vault objects remain recoverable.')
@minValue(7)
@maxValue(90)
param softDeleteRetentionDays int

@description('Whether the environment prevents vault objects from being purged during retention.')
param purgeProtectionEnabled bool

var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)
var keyVaultSecretsOfficerRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
)
var keyVaultCertificateUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'db79e9a7-68ee-4b58-9aeb-b90e7c24fcba'
)

resource apiRuntimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: apiRuntimeIdentityName
  location: location
  tags: tags
}

resource secretPublisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: configurationPublisherIdentityName
  location: location
  tags: tags
}

resource secretPublisherFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-${environmentName}'
  parent: secretPublisherIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: configurationPublisherFederatedSubject
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    accessPolicies: []
    enablePurgeProtection: purgeProtectionEnabled
    enableRbacAuthorization: true
    enableSoftDelete: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    publicNetworkAccess: 'Enabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
    softDeleteRetentionInDays: softDeleteRetentionDays
    tenantId: subscription().tenantId
  }
}

resource apiRuntimeSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiRuntimeIdentity.id, keyVaultSecretsUserRoleDefinitionId)
  scope: keyVault
  properties: {
    principalId: apiRuntimeIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

resource secretPublisherRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, secretPublisherIdentity.id, keyVaultSecretsOfficerRoleDefinitionId)
  scope: keyVault
  properties: {
    principalId: secretPublisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsOfficerRoleDefinitionId
  }
}

resource frontendCertificateUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, frontendPrincipalId, keyVaultCertificateUserRoleDefinitionId)
  scope: keyVault
  properties: {
    principalId: frontendPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultCertificateUserRoleDefinitionId
  }
}

@description('Azure Key Vault resource identifier.')
output keyVaultId string = keyVault.id

@description('Azure Key Vault resource name.')
output keyVaultName string = keyVault.name

@description('Azure Key Vault URI used for non-secret reference construction.')
output keyVaultUri string = keyVault.properties.vaultUri

@description('API runtime managed identity resource identifier.')
output apiRuntimeIdentityId string = apiRuntimeIdentity.id

@description('API runtime managed identity client identifier.')
output apiRuntimeIdentityClientId string = apiRuntimeIdentity.properties.clientId

@description('API runtime managed identity principal identifier.')
output apiRuntimeIdentityPrincipalId string = apiRuntimeIdentity.properties.principalId

@description('Key Vault Secrets User assignment for the API runtime identity.')
output apiRuntimeRoleAssignmentId string = apiRuntimeSecretsUserRoleAssignment.id

@description('Secret publisher managed identity resource identifier.')
output secretPublisherIdentityId string = secretPublisherIdentity.id

@description('Secret publisher managed identity client identifier.')
output secretPublisherIdentityClientId string = secretPublisherIdentity.properties.clientId

@description('Secret publisher managed identity principal identifier.')
output secretPublisherIdentityPrincipalId string = secretPublisherIdentity.properties.principalId

@description('GitHub OpenID Connect federated credential for secret publication.')
output secretPublisherFederatedCredentialId string = secretPublisherFederatedCredential.id

@description('Key Vault Secrets Officer assignment for the publication-only identity.')
output secretPublisherRoleAssignmentId string = secretPublisherRoleAssignment.id

@description('Key Vault Certificate User assignment for the Static Web Apps identity.')
output frontendCertificateRoleAssignmentId string = frontendCertificateUserRoleAssignment.id

@description('Non-secret secure configuration contract.')
output configuration object = {
  apiRuntimeIdentityId: apiRuntimeIdentity.id
  frontendCertificateRoleAssignmentId: frontendCertificateUserRoleAssignment.id
  keyVaultId: keyVault.id
  keyVaultName: keyVault.name
  keyVaultUri: keyVault.properties.vaultUri
  purgeProtectionEnabled: purgeProtectionEnabled
  secretPublisherFederatedSubject: configurationPublisherFederatedSubject
  softDeleteRetentionDays: softDeleteRetentionDays
}
