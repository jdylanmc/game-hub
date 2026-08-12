targetScope = 'resourceGroup'

metadata description = 'Creates the private blob asset boundary and its federated publication identity.'

@description('General-purpose v2 storage account name.')
param storageAccountName string

@description('User-assigned managed identity name used only for asset publication.')
param publisherIdentityName string

@description('Deployment environment represented by the federated credential.')
param environmentName string

@description('Microsoft Entra federated subject allowed to publish assets.')
param publisherFederatedSubject string

@description('Azure region for the storage account and publisher identity.')
param location string

@description('Required environment tags.')
param tags object

@description('Storage redundancy selected for this environment.')
@allowed([
  'Standard_LRS'
  'Standard_ZRS'
])
param storageSkuName string

@description('Days that deleted blobs and containers remain recoverable.')
@minValue(1)
@maxValue(365)
param deleteRetentionDays int

var storageBlobDataContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource publisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: publisherIdentityName
  location: location
  tags: tags
}

resource publisherFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-${environmentName}'
  parent: publisherIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: publisherFederatedSubject
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: storageSkuName
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    encryption: {
      keySource: 'Microsoft.Storage'
      requireInfrastructureEncryption: true
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
      }
    }
    isHnsEnabled: false
    isLocalUserEnabled: false
    isNfsV3Enabled: false
    isSftpEnabled: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  name: 'default'
  parent: storageAccount
  properties: {
    containerDeleteRetentionPolicy: {
      enabled: true
      days: deleteRetentionDays
    }
    deleteRetentionPolicy: {
      allowPermanentDelete: false
      enabled: true
      days: deleteRetentionDays
    }
    isVersioningEnabled: false
  }
}

resource gameAssetsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  name: 'game-assets'
  parent: blobService
  properties: {
    defaultEncryptionScope: '$account-encryption-key'
    denyEncryptionScopeOverride: true
    publicAccess: 'None'
  }
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  name: 'media'
  parent: blobService
  properties: {
    defaultEncryptionScope: '$account-encryption-key'
    denyEncryptionScopeOverride: true
    publicAccess: 'None'
  }
}

resource staticAssetsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  name: 'static-assets'
  parent: blobService
  properties: {
    defaultEncryptionScope: '$account-encryption-key'
    denyEncryptionScopeOverride: true
    publicAccess: 'None'
  }
}

resource publisherRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, publisherIdentity.id, storageBlobDataContributorRoleDefinitionId)
  scope: storageAccount
  properties: {
    principalId: publisherIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId
  }
}

@description('Asset storage account resource identifier.')
output storageAccountId string = storageAccount.id

@description('Asset storage account name.')
output storageAccountName string = storageAccount.name

@description('Microsoft Entra-authenticated Blob service endpoint.')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob

@description('Storage redundancy selected for this environment.')
output storageSkuName string = storageSkuName

@description('Private asset container names and resource identifiers.')
output containers object = {
  gameAssets: {
    id: gameAssetsContainer.id
    name: gameAssetsContainer.name
  }
  media: {
    id: mediaContainer.id
    name: mediaContainer.name
  }
  staticAssets: {
    id: staticAssetsContainer.id
    name: staticAssetsContainer.name
  }
}

@description('User-assigned managed identity resource identifier used for asset publication.')
output publisherIdentityId string = publisherIdentity.id

@description('User-assigned managed identity client identifier used for OpenID Connect publication.')
output publisherIdentityClientId string = publisherIdentity.properties.clientId

@description('User-assigned managed identity principal identifier used for asset publication.')
output publisherIdentityPrincipalId string = publisherIdentity.properties.principalId

@description('GitHub OpenID Connect federated credential resource identifier.')
output publisherFederatedCredentialId string = publisherFederatedCredential.id

@description('Deterministic Storage Blob Data Contributor role assignment identifier.')
output publisherRoleAssignmentId string = publisherRoleAssignment.id

@description('Non-secret Microsoft Entra upload targets for the three asset categories.')
output uploadTargets object = {
  accountName: storageAccount.name
  authMode: 'login'
  federatedSubject: publisherFederatedSubject
  publisherIdentityClientId: publisherIdentity.properties.clientId
  targets: {
    gameAssets: {
      containerName: gameAssetsContainer.name
      containerResourceId: gameAssetsContainer.id
      destinationUri: '${storageAccount.properties.primaryEndpoints.blob}${gameAssetsContainer.name}'
    }
    media: {
      containerName: mediaContainer.name
      containerResourceId: mediaContainer.id
      destinationUri: '${storageAccount.properties.primaryEndpoints.blob}${mediaContainer.name}'
    }
    staticAssets: {
      containerName: staticAssetsContainer.name
      containerResourceId: staticAssetsContainer.id
      destinationUri: '${storageAccount.properties.primaryEndpoints.blob}${staticAssetsContainer.name}'
    }
  }
}
