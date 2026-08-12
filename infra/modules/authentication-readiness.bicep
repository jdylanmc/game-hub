targetScope = 'resourceGroup'

metadata description = 'Creates the keyless Static Web Apps authentication and linked API trust boundary.'

@description('Azure Static Web Apps resource name.')
param staticWebAppName string

@description('Generated Azure Static Web Apps hostname.')
param staticWebAppHostName string

@description('System-assigned Static Web Apps managed identity principal identifier.')
param staticWebAppPrincipalId string

@description('Azure Container App resource identifier linked as the production API backend.')
param apiResourceId string

@description('System-assigned API runtime managed identity principal identifier.')
param apiRuntimePrincipalId string

@description('Azure region that contains the linked Container App.')
param backendRegion string

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' existing = {
  name: staticWebAppName
}

resource productionApiBackend 'Microsoft.Web/staticSites/linkedBackends@2025-03-01' = {
  parent: staticWebApp
  name: 'production'
  kind: 'containerapp'
  properties: {
    backendResourceId: apiResourceId
    region: backendRegion
  }
}

var frontendEndpoint = 'https://${staticWebAppHostName}'
var apiBasePath = '/api'
var authenticationProvider = 'azureActiveDirectory'
var authenticationProviderRoute = 'aad'
var authenticatedRole = 'authenticated'
var principalHeaderName = 'x-ms-client-principal'

@description('Static Web Apps linked-backend resource identifier.')
output linkedBackendId string = productionApiBackend.id

@description('Stable same-origin API endpoint presented to the browser.')
output authenticatedApiEndpoint string = '${frontendEndpoint}${apiBasePath}'

@description('Non-secret authentication and authorization contract for the frontend and API.')
output configuration object = {
  api: {
    allowedRoles: [
      authenticatedRole
    ]
    applicationSettings: {
      principalHeader: 'GAME_HUB_AUTH_PRINCIPAL_HEADER'
      provider: 'GAME_HUB_AUTH_PROVIDER'
      requiredRole: 'GAME_HUB_AUTH_REQUIRED_ROLE'
    }
    browserBasePath: apiBasePath
    browserEndpoint: '${frontendEndpoint}${apiBasePath}'
    directEndpointPurpose: 'diagnostics-only'
    linkedBackendId: productionApiBackend.id
    principalHeaderName: principalHeaderName
    runtimeManagedIdentityPrincipalId: apiRuntimePrincipalId
  }
  credentials: {
    clientCredentialRequired: false
    deploymentAuthentication: 'Microsoft Entra workload identity federation with OpenID Connect'
    providerRegistration: 'Azure-managed preconfigured provider'
    secretValuesAccepted: false
  }
  frontend: {
    currentUserEndpoint: '${frontendEndpoint}/.auth/me'
    loginEndpoint: '${frontendEndpoint}/.auth/login/${authenticationProviderRoute}'
    logoutEndpoint: '${frontendEndpoint}/.auth/logout'
    provider: authenticationProvider
    protocol: 'OpenID Connect'
    systemAssignedPrincipalId: staticWebAppPrincipalId
  }
  trustBoundaries: {
    apiIngress: 'Azure Static Web Apps linked backend'
    browserAuthenticationTerminus: 'Azure Static Web Apps'
    containerOutboundAccess: 'API system-assigned managed identity'
  }
}
