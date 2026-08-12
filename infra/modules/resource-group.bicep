targetScope = 'subscription'

metadata description = 'Creates the resource group boundary for one Game Hub environment.'

@description('Resource group name.')
param name string

@description('Azure region for the resource group metadata.')
param location string

@description('Required environment tags.')
param tags object

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: name
  location: location
  tags: tags
}

@description('Resource group name.')
output name string = resourceGroup.name

@description('Resource group identifier.')
output id string = resourceGroup.id
