using '../main.bicep'

param targetSubscriptionId = '11213dbd-39fe-46ba-87db-5f5e8c449aed'
param applicationName = 'gamehub'
param environmentName = 'dev'
param location = 'eastus2'
param locationCode = 'eus2'
param workloadOwner = 'game-hub'
param costCenter = 'game-hub'
param frontendStagingEnvironmentPolicy = 'Enabled'
param apiContainerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld@sha256:e9b3e7c34664c7cffd7144864b0e4eec369bfde80068f9095dc63b37058bec48'
param apiImageRepository = 'game-hub-api'
param apiIngressExternal = true
param apiIngressTargetPort = 80
param apiIngressTransport = 'auto'
param apiMinReplicas = 0
param apiMaxReplicas = 2
param apiCpuCores = '0.25'
param apiMemory = '0.5Gi'
param apiHttpConcurrentRequests = 50
param apiEnvironmentVariables = [
  {
    name: 'GAME_HUB_ENVIRONMENT'
    value: 'dev'
  }
]
param assetStorageSkuName = 'Standard_LRS'
param assetDeleteRetentionDays = 7
param gameAssetsCacheDuration = '1.00:00:00'
param mediaCacheDuration = '00:05:00'
param staticAssetsCacheDuration = '01:00:00'
param additionalTags = {
  lifecycle: 'on-demand'
}
