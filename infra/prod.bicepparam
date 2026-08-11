using './bicep/main.bicep'

// Production environment parameters
param resourceGroupName = 'game-hub-adversarial-agents-prod'
param location = 'eastus'
param environment = 'prod'
param maxConcurrentReviews = 3
param monthlyBudgetUsd = 100
param resourceNamePrefix = 'game-hub-adversarial'
param modelDeploymentId = 'game-hub-unit-test-reviewer'
