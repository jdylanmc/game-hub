using '../main.bicep'

param targetSubscriptionId = '11213dbd-39fe-46ba-87db-5f5e8c449aed'
param applicationName = 'gamehub'
param environmentName = 'prod'
param location = 'eastus2'
param locationCode = 'eus2'
param workloadOwner = 'game-hub'
param costCenter = 'game-hub'
param frontendStagingEnvironmentPolicy = 'Disabled'
param additionalTags = {
  lifecycle: 'persistent'
}
