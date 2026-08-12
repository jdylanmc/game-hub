targetScope = 'subscription'

metadata description = 'Bootstraps the keyless identity used by Game Hub infrastructure deployment.'

@description('Azure subscription that owns Game Hub.')
@allowed([
  '11213dbd-39fe-46ba-87db-5f5e8c449aed'
])
param targetSubscriptionId string

@description('Deployment environment.')
@allowed([
  'dev'
  'prod'
])
param environmentName string

@description('Azure region for the deployment identity.')
param location string

@description('Stable short code for the selected Azure region.')
param locationCode string

@description('Immutable GitHub environment subject trusted by this identity.')
param federatedSubject string

var applicationName = 'gamehub'
var workloadResourceGroupName = 'rg-${applicationName}-${environmentName}-${locationCode}'
var identityResourceGroupName = 'rg-${applicationName}-deployment-${environmentName}-${locationCode}'
var identityName = 'id-deploy-${applicationName}-${environmentName}-${locationCode}'
var deploymentIdentityResourceId = resourceId(
  targetSubscriptionId,
  identityResourceGroupName,
  'Microsoft.ManagedIdentity/userAssignedIdentities',
  identityName
)
var subscriptionDeploymentExecutorRoleDefinitionName = guid(
  targetSubscriptionId,
  'game-hub-subscription-deployment-executor'
)
var tags = {
  application: applicationName
  environment: environmentName
  lifecycle: 'deployment-bootstrap'
  managedBy: 'bicep'
  repository: 'jdylanmc/game-hub'
}

module workloadResourceGroup '../modules/resource-group.bicep' = {
  name: '${applicationName}-${environmentName}-bootstrap-workload-resource-group'
  scope: subscription(targetSubscriptionId)
  params: {
    location: location
    name: workloadResourceGroupName
    tags: tags
  }
}

module identityResourceGroup '../modules/resource-group.bicep' = {
  name: '${applicationName}-${environmentName}-bootstrap-identity-resource-group'
  scope: subscription(targetSubscriptionId)
  params: {
    location: location
    name: identityResourceGroupName
    tags: tags
  }
}

module deploymentIdentity './deployment-identity.bicep' = {
  name: '${applicationName}-${environmentName}-deployment-identity'
  scope: resourceGroup(targetSubscriptionId, identityResourceGroupName)
  params: {
    environmentName: environmentName
    federatedSubject: federatedSubject
    identityName: identityName
    location: location
    tags: tags
  }
  dependsOn: [
    identityResourceGroup
  ]
}

resource subscriptionDeploymentExecutorRoleDefinition 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: subscriptionDeploymentExecutorRoleDefinitionName
  properties: {
    assignableScopes: [
      '/subscriptions/${targetSubscriptionId}'
    ]
    description: 'Starts, validates, previews, and reads Game Hub subscription deployments without resource-provider permissions.'
    permissions: [
      {
        actions: [
          'Microsoft.Resources/deployments/*'
          'Microsoft.Resources/subscriptions/resourceGroups/read'
        ]
        dataActions: []
        notActions: []
        notDataActions: []
      }
    ]
    roleName: 'Game Hub Subscription Deployment Executor'
    type: 'CustomRole'
  }
}

resource subscriptionDeploymentRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().subscriptionId, deploymentIdentityResourceId, subscriptionDeploymentExecutorRoleDefinition.id)
  properties: {
    principalId: deploymentIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionDeploymentExecutorRoleDefinition.id
  }
}

module workloadRoleAssignments './workload-role-assignments.bicep' = {
  name: '${applicationName}-${environmentName}-workload-role-assignments'
  scope: resourceGroup(targetSubscriptionId, workloadResourceGroupName)
  params: {
    deploymentIdentityId: deploymentIdentityResourceId
    deploymentIdentityPrincipalId: deploymentIdentity.outputs.principalId
  }
  dependsOn: [
    workloadResourceGroup
  ]
}

@description('Non-secret deployment identity and scope contract.')
output deploymentIdentityConfiguration object = {
  clientId: deploymentIdentity.outputs.clientId
  federatedCredentialId: deploymentIdentity.outputs.federatedCredentialId
  federatedSubject: federatedSubject
  identityId: deploymentIdentity.outputs.id
  identityResourceGroupName: identityResourceGroupName
  principalId: deploymentIdentity.outputs.principalId
  subscriptionDeploymentRoleAssignmentId: subscriptionDeploymentRoleAssignment.id
  targetSubscriptionId: targetSubscriptionId
  tenantId: tenant().tenantId
  workloadContributorRoleAssignmentId: workloadRoleAssignments.outputs.contributorRoleAssignmentId
  workloadResourceGroupName: workloadResourceGroupName
  workloadRoleAdministratorRoleAssignmentId: workloadRoleAssignments.outputs.roleAdministratorRoleAssignmentId
}
