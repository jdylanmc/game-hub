using './bicep/main.bicep'

// Test/staging environment parameters
// Lower concurrency and budget for validation deployments
param resourceGroupName = 'game-hub-adversarial-agents-test'
param location = 'eastus'
param environment = 'test'
param maxConcurrentReviews = 1
param monthlyBudgetUsd = 20
param resourceNamePrefix = 'game-hub-adversarial'
param modelDeploymentId = 'game-hub-unit-test-reviewer'
