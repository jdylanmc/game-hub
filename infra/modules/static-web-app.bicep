targetScope = 'resourceGroup'

metadata description = 'Creates the Azure Static Web Apps frontend hosting boundary.'

@description('Azure Static Web Apps resource name.')
param name string

@description('Azure region for the static web app.')
param location string

@description('Required environment tags.')
param tags object

@description('Whether preview staging environments are available.')
@allowed([
  'Disabled'
  'Enabled'
])
param stagingEnvironmentPolicy string

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    allowConfigFileUpdates: true
    buildProperties: {
      appLocation: '/'
      outputLocation: 'dist'
      skipGithubActionWorkflowGeneration: true
    }
    enterpriseGradeCdnStatus: 'Disabled'
    publicNetworkAccess: 'Enabled'
    stagingEnvironmentPolicy: stagingEnvironmentPolicy
  }
}

@description('Static web app resource identifier.')
output id string = staticWebApp.id

@description('Static web app resource name.')
output name string = staticWebApp.name

@description('Generated Azure Static Web Apps hostname.')
output defaultHostname string = staticWebApp.properties.defaultHostname

@description('Public HTTPS endpoint for direct frontend diagnostics.')
output endpoint string = 'https://${staticWebApp.properties.defaultHostname}'

@description('Non-secret contract for publishing the existing Vite output.')
output deploymentConfiguration object = {
  appLocation: '/'
  buildCommand: 'yarn build'
  configFilePath: 'dist/staticwebapp.config.json'
  environment: 'production'
  outputLocation: 'dist'
  skipAppBuild: true
}
