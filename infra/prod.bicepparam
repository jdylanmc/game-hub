using './bicep/main.bicep'

// Production environment parameters
param resourceGroupName = 'game-hub-adversarial-agents-prod'
param location = 'eastus'
param environment = 'prod'
param monthlyBudgetUsd = 99
param budgetContactEmails = [
  'dylan@microsoft.com'
]
param reviewerPrincipalId = ''
param resourceNamePrefix = 'game-hub-adversarial'
param modelDeploymentId = 'game-hub-unit-test-reviewer'
param gilfoyleModelDeploymentId = 'game-hub-gilfoyle-security-architect'
