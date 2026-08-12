targetScope = 'resourceGroup'

metadata description = 'Creates the keyless durable mapping from platform identities to Game Hub user IDs.'

@description('Dedicated general-purpose v2 storage account name.')
param storageAccountName string

@description('Azure region for identity storage.')
param location string

@description('Required environment tags.')
param tags object

@description('Storage redundancy selected for identity records.')
@allowed([
  'Standard_LRS'
  'Standard_ZRS'
])
param storageSkuName string

@description('Azure Table name that stores identity mappings.')
@minLength(3)
@maxLength(63)
param tableName string = 'useridentities'

@description('API runtime managed identity principal identifier.')
param apiRuntimePrincipalId string

var storageTableDataContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
)
var identityTags = union(tags, {
  dataClassification: 'pseudonymous-identity'
})

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageAccountName
  location: location
  tags: identityTags
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
        table: {
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

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2025-01-01' = {
  name: 'default'
  parent: storageAccount
}

resource identityTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-01-01' = {
  name: tableName
  parent: tableService
}

resource apiRuntimeRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, apiRuntimePrincipalId, storageTableDataContributorRoleDefinitionId)
  scope: storageAccount
  properties: {
    principalId: apiRuntimePrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageTableDataContributorRoleDefinitionId
  }
}

@description('Identity storage account resource identifier.')
output storageAccountId string = storageAccount.id

@description('Identity storage account name.')
output storageAccountName string = storageAccount.name

@description('Microsoft Entra-authenticated Azure Tables endpoint.')
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table

@description('Identity table resource identifier.')
output tableId string = identityTable.id

@description('Identity table name.')
output tableName string = tableName

@description('Storage Table Data Contributor assignment for the API runtime identity.')
output apiRuntimeRoleAssignmentId string = apiRuntimeRoleAssignment.id

@description('Non-secret durable identity storage contract.')
output configuration object = {
  authentication: 'Microsoft Entra managed identity'
  storesRawPlatformSubject: false
  storageAccountId: storageAccount.id
  storageAccountName: storageAccount.name
  tableEndpoint: storageAccount.properties.primaryEndpoints.table
  tableId: identityTable.id
  tableName: tableName
}
