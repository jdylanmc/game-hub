targetScope = 'resourceGroup'

metadata description = 'Creates bounded monitoring resources and sends platform diagnostics to one environment workspace.'

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Workspace-based Application Insights resource name.')
param applicationInsightsName string

@description('Azure Static Web Apps resource name.')
param staticWebAppName string

@description('Azure Container Registry resource name.')
param containerRegistryName string

@description('Azure Container Apps managed environment name.')
param containerAppsEnvironmentName string

@description('Azure Container App resource name.')
param containerAppName string

@description('Asset storage account name.')
param storageAccountName string

@description('Identity storage account name.')
param identityStorageAccountName string

@description('Azure Front Door profile name.')
param frontDoorProfileName string

@description('Azure Key Vault name.')
param keyVaultName string

@description('Azure region for monitoring resources.')
param location string

@description('Required environment tags.')
param tags object

@description('Analytics retention in days.')
@minValue(30)
@maxValue(730)
param retentionInDays int

@description('Maximum Log Analytics ingestion in gigabytes per day.')
@minValue(1)
param dailyIngestionCapGb int

@description('Application Insights sampling percentage.')
@minValue(1)
@maxValue(100)
param applicationInsightsSamplingPercentage int

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    retentionInDays: retentionInDays
    sku: {
      name: 'PerGB2018'
    }
    workspaceCapping: {
      dailyQuotaGb: dailyIngestionCapGb
    }
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    DisableIpMasking: false
    IngestionMode: 'LogAnalytics'
    RetentionInDays: retentionInDays
    SamplingPercentage: applicationInsightsSamplingPercentage
    WorkspaceResourceId: logAnalyticsWorkspace.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' existing = {
  name: staticWebAppName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: containerRegistryName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: containerAppsEnvironmentName
}

resource containerApp 'Microsoft.App/containerApps@2025-01-01' existing = {
  name: containerAppName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' existing = {
  name: 'default'
  parent: storageAccount
}

resource identityStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: identityStorageAccountName
}

resource identityTableService 'Microsoft.Storage/storageAccounts/tableServices@2025-01-01' existing = {
  name: 'default'
  parent: identityStorageAccount
}

resource frontDoorProfile 'Microsoft.Cdn/profiles@2025-01-01-preview' existing = {
  name: frontDoorProfileName
}

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: keyVaultName
}

resource staticWebAppDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: staticWebApp
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource containerRegistryDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: containerRegistry
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource containerAppsEnvironmentDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: containerAppsEnvironment
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource containerAppDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: containerApp
  properties: {
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource blobServiceDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: blobService
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource identityTableServiceDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: identityTableService
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource frontDoorDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: frontDoorProfile
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

resource keyVaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-log-analytics'
  scope: keyVault
  properties: {
    logs: [
      {
        categoryGroup: 'audit'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspace.id
  }
}

var diagnosticSettingIds = {
  api: containerAppDiagnostics.id
  apiEnvironment: containerAppsEnvironmentDiagnostics.id
  assets: blobServiceDiagnostics.id
  frontend: staticWebAppDiagnostics.id
  frontDoor: frontDoorDiagnostics.id
  identityStorage: identityTableServiceDiagnostics.id
  keyVault: keyVaultDiagnostics.id
  registry: containerRegistryDiagnostics.id
}

@description('Log Analytics workspace resource identifier.')
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id

@description('Log Analytics workspace resource name.')
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name

@description('Workspace-based Application Insights resource identifier.')
output applicationInsightsId string = applicationInsights.id

@description('Workspace-based Application Insights resource name.')
output applicationInsightsName string = applicationInsights.name

@description('Non-secret Application Insights application identifier.')
output applicationInsightsApplicationId string = applicationInsights.properties.AppId

@description('Diagnostic setting resource identifiers by monitored boundary.')
output diagnosticSettingIds object = {
  api: diagnosticSettingIds.api
  apiEnvironment: diagnosticSettingIds.apiEnvironment
  assets: diagnosticSettingIds.assets
  frontend: diagnosticSettingIds.frontend
  frontDoor: diagnosticSettingIds.frontDoor
  identityStorage: diagnosticSettingIds.identityStorage
  keyVault: diagnosticSettingIds.keyVault
  registry: diagnosticSettingIds.registry
}

@description('Non-secret monitoring and ingestion-cost contract.')
output configuration object = {
  applicationInsights: {
    applicationId: applicationInsights.properties.AppId
    id: applicationInsights.id
    name: applicationInsights.name
  }
  applicationInsightsSamplingPercentage: applicationInsightsSamplingPercentage
  dailyIngestionCapGb: dailyIngestionCapGb
  diagnosticDestinations: diagnosticSettingIds
  logAnalyticsWorkspace: {
    id: logAnalyticsWorkspace.id
    name: logAnalyticsWorkspace.name
  }
  retentionInDays: retentionInDays
}
