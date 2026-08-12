using '../main.bicep'

param targetSubscriptionId = '11213dbd-39fe-46ba-87db-5f5e8c449aed'
param applicationName = 'gamehub'
param environmentName = 'prod'
param location = 'eastus2'
param locationCode = 'eus2'
param workloadOwner = 'game-hub'
param costCenter = 'game-hub'
param frontendStagingEnvironmentPolicy = 'Disabled'
param apiContainerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld@sha256:e9b3e7c34664c7cffd7144864b0e4eec369bfde80068f9095dc63b37058bec48'
param apiImageRepository = 'game-hub-api'
param apiIngressExternal = true
param apiIngressTargetPort = 80
param apiIngressTransport = 'auto'
param apiMinReplicas = 1
param apiMaxReplicas = 5
param apiCpuCores = '0.5'
param apiMemory = '1Gi'
param apiHttpConcurrentRequests = 100
param apiEnvironmentVariables = [
  {
    name: 'GAME_HUB_ENVIRONMENT'
    value: 'prod'
  }
]
param additionalTags = {
  lifecycle: 'persistent'
}
