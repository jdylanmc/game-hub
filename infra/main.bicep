targetScope = 'subscription'

metadata description = 'Subscription entry point for one Game Hub environment.'

@description('Azure subscription that owns every Game Hub environment.')
@allowed([
  '11213dbd-39fe-46ba-87db-5f5e8c449aed'
])
param targetSubscriptionId string

@description('Short workload name used in resource names and tags.')
@minLength(3)
@maxLength(12)
param applicationName string

@description('Deployment environment.')
@allowed([
  'dev'
  'prod'
])
param environmentName string

@description('Primary Azure region for regional resources.')
param location string

@description('Stable short code for the selected Azure region.')
@minLength(2)
@maxLength(8)
param locationCode string

@description('Non-personal workload owner tag.')
param workloadOwner string

@description('Cost allocation tag.')
param costCenter string

@description('Additional non-secret environment tags.')
param additionalTags object = {}

var resourceGroupName = 'rg-${applicationName}-${environmentName}-${locationCode}'
var requiredTags = {
  application: applicationName
  costCenter: costCenter
  environment: environmentName
  managedBy: 'bicep'
  owner: workloadOwner
  repository: 'jdylanmc/game-hub'
}
var tags = union(additionalTags, requiredTags)

module resourceGroupModule './modules/resource-group.bicep' = {
  name: '${applicationName}-${environmentName}-resource-group'
  scope: subscription(targetSubscriptionId)
  params: {
    location: location
    name: resourceGroupName
    tags: tags
  }
}

module foundation './modules/foundation.bicep' = {
  name: '${applicationName}-${environmentName}-foundation'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    applicationName: applicationName
    environmentName: environmentName
    location: location
    locationCode: locationCode
    tags: tags
    targetSubscriptionId: targetSubscriptionId
  }
  dependsOn: [
    resourceGroupModule
  ]
}

@description('Explicit Azure subscription selected for this environment.')
output subscriptionId string = targetSubscriptionId

@description('Regional location selected for resources.')
output location string = foundation.outputs.location

@description('Resource group that contains the environment.')
output resourceGroupName string = resourceGroupModule.outputs.name

@description('Resource group identifier used by deployment automation.')
output resourceGroupId string = resourceGroupModule.outputs.id

@description('Deterministic names reserved for later service modules.')
output resourceNames object = foundation.outputs.resourceNames

@description('Required environment tags applied by service modules.')
output tags object = foundation.outputs.tags
