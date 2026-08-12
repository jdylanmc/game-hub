targetScope = 'resourceGroup'

metadata description = 'Scopes the infrastructure deployment identity to one Game Hub environment resource group.'

@description('Deployment identity resource identifier used for deterministic role assignment names.')
param deploymentIdentityId string

@description('Deployment identity principal identifier.')
param deploymentIdentityPrincipalId string

var contributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b24988ac-6180-42a0-ab88-20f7382dd24c'
)
var roleBasedAccessControlAdministratorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'f58310d9-a9f6-439a-9e8d-f62e7b41a168'
)

resource workloadContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentityId, contributorRoleDefinitionId)
  properties: {
    principalId: deploymentIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleDefinitionId
  }
}

resource workloadRoleAdministratorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentityId, roleBasedAccessControlAdministratorRoleDefinitionId)
  properties: {
    principalId: deploymentIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: roleBasedAccessControlAdministratorRoleDefinitionId
  }
}

@description('Contributor role assignment identifier.')
output contributorRoleAssignmentId string = workloadContributorRoleAssignment.id

@description('Role Based Access Control Administrator role assignment identifier.')
output roleAdministratorRoleAssignmentId string = workloadRoleAdministratorRoleAssignment.id
