using './bicep/main.bicep'

// Test environment parameters
param resourceGroupName = 'game-hub-adversarial-agents-test'
param location = 'eastus'
param environment = 'test'
param monthlyBudgetUsd = 20
param budgetContactEmails = [
  'dylan@microsoft.com'
]
param reviewerPrincipalId = ''
param resourceNamePrefix = 'game-hub-adversarial'
param modelDeploymentId = 'game-hub-unit-test-reviewer'
param gilfoyleModelDeploymentId = 'game-hub-gilfoyle-security-architect'
