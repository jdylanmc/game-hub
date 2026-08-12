targetScope = 'subscription'

@description('Object ID of the protected GitHub deployment environment service principal.')
param deploymentPrincipalId string

var roleName = 'Game Hub Adversarial Infrastructure Deployer'
var roleDefinitionGuid = guid(subscription().id, roleName)
var cognitiveServicesOpenAIUserRoleGuid = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource deploymentRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: roleDefinitionGuid
  properties: {
    roleName: roleName
    description: 'Deploys only Game Hub adversarial resource groups, Azure OpenAI resources, budgets, deployments, and the inference role assignment.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.Resources/subscriptions/resourceGroups/read'
          'Microsoft.Resources/subscriptions/resourceGroups/write'
          'Microsoft.Resources/deployments/*'
          'Microsoft.CognitiveServices/accounts/read'
          'Microsoft.CognitiveServices/accounts/write'
          'Microsoft.CognitiveServices/accounts/delete'
          'Microsoft.CognitiveServices/accounts/deployments/read'
          'Microsoft.CognitiveServices/accounts/deployments/write'
          'Microsoft.CognitiveServices/accounts/deployments/delete'
          'Microsoft.Consumption/budgets/read'
          'Microsoft.Consumption/budgets/write'
          'Microsoft.Consumption/budgets/delete'
          'Microsoft.Authorization/roleAssignments/read'
          'Microsoft.Authorization/roleAssignments/write'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
    assignableScopes: [
      subscription().id
    ]
  }
}

resource deploymentRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, deploymentPrincipalId, deploymentRole.id)
  properties: {
    principalId: deploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: deploymentRole.id
    conditionVersion: '2.0'
    condition: '((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/write\'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${cognitiveServicesOpenAIUserRoleGuid}}))'
  }
}
