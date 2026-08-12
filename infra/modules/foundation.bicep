targetScope = 'resourceGroup'

metadata description = 'Defines the stable naming and output contract consumed by service modules.'

@description('Azure subscription that owns the environment.')
param targetSubscriptionId string

@description('Short workload name used in resource names.')
param applicationName string

@description('Deployment environment.')
param environmentName string

@description('Primary Azure region for regional resources.')
param location string

@description('Stable short code for the selected Azure region.')
param locationCode string

@description('Required environment tags.')
param tags object

var baseName = '${applicationName}-${environmentName}-${locationCode}'
var compactName = replace(baseName, '-', '')
var uniquenessSuffix = uniqueString(targetSubscriptionId, resourceGroup().id)
var resourceNames = {
  applicationInsights: 'appi-${baseName}'
  assetPublisherManagedIdentity: 'id-assets-${baseName}'
  apiManagedIdentity: 'id-api-${baseName}'
  containerApp: 'ca-${baseName}'
  containerAppsEnvironment: 'cae-${baseName}'
  containerRegistry: take('acr${compactName}${uniquenessSuffix}', 50)
  frontDoorEndpoint: take('fde-${baseName}-${uniquenessSuffix}', 46)
  frontDoorProfile: 'afd-${baseName}'
  keyVault: take('kv-${baseName}-${uniquenessSuffix}', 24)
  logAnalyticsWorkspace: 'log-${baseName}'
  staticWebApp: take('swa-${baseName}', 40)
  storageAccount: take('st${compactName}${uniquenessSuffix}', 24)
  webApplicationFirewallPolicy: 'waf-${baseName}'
}

@description('Regional location selected for resources.')
output location string = location

@description('Deterministic names reserved for later service modules.')
output resourceNames object = resourceNames

@description('Required environment tags applied by service modules.')
output tags object = tags
