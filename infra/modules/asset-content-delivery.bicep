targetScope = 'resourceGroup'

metadata description = 'Creates Azure Front Door content delivery for Microsoft Entra-protected blob assets.'

@description('Azure Front Door Premium profile name.')
param profileName string

@description('Globally unique Azure Front Door endpoint name.')
param endpointName string

@description('Asset storage account name.')
param storageAccountName string

@description('Asset Blob service hostname without a scheme.')
param storageBlobHostName string

@description('Required environment tags.')
param tags object

@description('Edge cache duration for immutable game assets in [d.]hh:mm:ss format.')
param gameAssetsCacheDuration string

@description('Edge cache duration for mutable user-facing media in [d.]hh:mm:ss format.')
param mediaCacheDuration string

@description('Edge cache duration for other static assets in [d.]hh:mm:ss format.')
param staticAssetsCacheDuration string

var storageBlobDataReaderRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
)
var contentTypesToCompress = [
  'application/javascript'
  'application/json'
  'application/manifest+json'
  'application/octet-stream'
  'application/wasm'
  'application/xml'
  'font/otf'
  'font/ttf'
  'font/woff'
  'font/woff2'
  'image/svg+xml'
  'text/css'
  'text/html'
  'text/javascript'
  'text/plain'
  'text/xml'
]

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: storageAccountName
}

resource profile 'Microsoft.Cdn/profiles@2025-01-01-preview' = {
  name: profileName
  location: 'global'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    originResponseTimeoutSeconds: 60
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-01-01-preview' = {
  name: endpointName
  parent: profile
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

resource storageReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, profile.id, storageBlobDataReaderRoleDefinitionId)
  scope: storageAccount
  properties: {
    principalId: profile.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataReaderRoleDefinitionId
  }
}

resource assetOriginGroup 'Microsoft.Cdn/profiles/originGroups@2025-01-01-preview' = {
  name: 'assets'
  parent: profile
  dependsOn: [
    storageReaderRoleAssignment
  ]
  properties: {
    authentication: {
      scope: 'https://storage.azure.com/.default'
      type: 'SystemAssignedIdentity'
    }
    loadBalancingSettings: {
      additionalLatencyInMilliseconds: 0
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    sessionAffinityState: 'Disabled'
  }
}

resource assetOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2025-01-01-preview' = {
  name: 'blob'
  parent: assetOriginGroup
  properties: {
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
    hostName: storageBlobHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: storageBlobHostName
    priority: 1
    weight: 1000
  }
}

resource gameAssetsRuleSet 'Microsoft.Cdn/profiles/ruleSets@2025-01-01-preview' = {
  name: 'gameAssetsCache'
  parent: profile
}

resource mediaRuleSet 'Microsoft.Cdn/profiles/ruleSets@2025-01-01-preview' = {
  name: 'mediaCache'
  parent: profile
}

resource staticAssetsRuleSet 'Microsoft.Cdn/profiles/ruleSets@2025-01-01-preview' = {
  name: 'staticAssetsCache'
  parent: profile
}

resource gameAssetsCacheRule 'Microsoft.Cdn/profiles/ruleSets/rules@2025-01-01-preview' = {
  name: 'cache'
  parent: gameAssetsRuleSet
  properties: {
    actions: [
      {
        name: 'CacheExpiration'
        parameters: {
          cacheBehavior: 'Override'
          cacheDuration: gameAssetsCacheDuration
          cacheType: 'All'
          typeName: 'DeliveryRuleCacheExpirationActionParameters'
        }
      }
    ]
    conditions: []
    order: 1
  }
}

resource mediaCacheRule 'Microsoft.Cdn/profiles/ruleSets/rules@2025-01-01-preview' = {
  name: 'cache'
  parent: mediaRuleSet
  properties: {
    actions: [
      {
        name: 'CacheExpiration'
        parameters: {
          cacheBehavior: 'Override'
          cacheDuration: mediaCacheDuration
          cacheType: 'All'
          typeName: 'DeliveryRuleCacheExpirationActionParameters'
        }
      }
    ]
    conditions: []
    order: 1
  }
}

resource staticAssetsCacheRule 'Microsoft.Cdn/profiles/ruleSets/rules@2025-01-01-preview' = {
  name: 'cache'
  parent: staticAssetsRuleSet
  properties: {
    actions: [
      {
        name: 'CacheExpiration'
        parameters: {
          cacheBehavior: 'Override'
          cacheDuration: staticAssetsCacheDuration
          cacheType: 'All'
          typeName: 'DeliveryRuleCacheExpirationActionParameters'
        }
      }
    ]
    conditions: []
    order: 1
  }
}

resource gameAssetsRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-01-01-preview' = {
  name: 'game-assets'
  parent: endpoint
  dependsOn: [
    assetOrigin
    gameAssetsCacheRule
  ]
  properties: {
    cacheConfiguration: {
      compressionSettings: {
        contentTypesToCompress: contentTypesToCompress
        isCompressionEnabled: true
      }
      queryStringCachingBehavior: 'IgnoreQueryString'
    }
    enabledState: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    originGroup: {
      id: assetOriginGroup.id
    }
    patternsToMatch: [
      '/game-assets/*'
    ]
    ruleSets: [
      {
        id: gameAssetsRuleSet.id
      }
    ]
    supportedProtocols: [
      'Http'
      'Https'
    ]
  }
}

resource mediaRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-01-01-preview' = {
  name: 'media'
  parent: endpoint
  dependsOn: [
    assetOrigin
    mediaCacheRule
  ]
  properties: {
    cacheConfiguration: {
      compressionSettings: {
        contentTypesToCompress: contentTypesToCompress
        isCompressionEnabled: true
      }
      queryStringCachingBehavior: 'IgnoreQueryString'
    }
    enabledState: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    originGroup: {
      id: assetOriginGroup.id
    }
    patternsToMatch: [
      '/media/*'
    ]
    ruleSets: [
      {
        id: mediaRuleSet.id
      }
    ]
    supportedProtocols: [
      'Http'
      'Https'
    ]
  }
}

resource staticAssetsRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-01-01-preview' = {
  name: 'static-assets'
  parent: endpoint
  dependsOn: [
    assetOrigin
    staticAssetsCacheRule
  ]
  properties: {
    cacheConfiguration: {
      compressionSettings: {
        contentTypesToCompress: contentTypesToCompress
        isCompressionEnabled: true
      }
      queryStringCachingBehavior: 'IgnoreQueryString'
    }
    enabledState: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    originGroup: {
      id: assetOriginGroup.id
    }
    patternsToMatch: [
      '/static-assets/*'
    ]
    ruleSets: [
      {
        id: staticAssetsRuleSet.id
      }
    ]
    supportedProtocols: [
      'Http'
      'Https'
    ]
  }
}

@description('Azure Front Door Premium profile resource identifier.')
output profileId string = profile.id

@description('Azure Front Door Premium profile name.')
output profileName string = profile.name

@description('Azure Front Door profile identity that reads private blobs.')
output profilePrincipalId string = profile.identity.principalId

@description('Storage Blob Data Reader assignment for the Front Door profile identity.')
output storageReaderRoleAssignmentId string = storageReaderRoleAssignment.id

@description('Azure Front Door endpoint resource identifier.')
output endpointId string = endpoint.id

@description('Azure Front Door endpoint hostname.')
output endpointHostName string = endpoint.properties.hostName

@description('Public Azure Front Door content endpoint.')
output endpointUrl string = 'https://${endpoint.properties.hostName}'

@description('Public endpoints for each isolated asset category.')
output categoryEndpoints object = {
  gameAssets: 'https://${endpoint.properties.hostName}/game-assets'
  media: 'https://${endpoint.properties.hostName}/media'
  staticAssets: 'https://${endpoint.properties.hostName}/static-assets'
}

@description('Explicit edge caching contract for each asset category.')
output caching object = {
  compressionEnabled: true
  gameAssets: {
    cacheBehavior: 'Override'
    duration: gameAssetsCacheDuration
    queryStringCachingBehavior: 'IgnoreQueryString'
  }
  media: {
    cacheBehavior: 'Override'
    duration: mediaCacheDuration
    queryStringCachingBehavior: 'IgnoreQueryString'
  }
  staticAssets: {
    cacheBehavior: 'Override'
    duration: staticAssetsCacheDuration
    queryStringCachingBehavior: 'IgnoreQueryString'
  }
}
