using '../main.bicep'

param targetSubscriptionId = '11213dbd-39fe-46ba-87db-5f5e8c449aed'
param applicationName = 'gamehub'
param environmentName = 'dev'
param location = 'eastus2'
param locationCode = 'eus2'
param workloadOwner = 'game-hub'
param costCenter = 'game-hub'
param additionalTags = {
  lifecycle: 'on-demand'
}
