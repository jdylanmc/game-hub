targetScope = 'subscription'

metadata description = 'Subscription entry point for one Game Hub environment.'

type NonSecretEnvironmentVariable = {
  name: string
  value: string
}

type SecretEnvironmentReference = {
  name: string
  secretRef: string
}

@description('Azure subscription that owns every Game Hub environment.')
@allowed([
  '11213dbd-39fe-46ba-87db-5f5e8c449aed'
])
param targetSubscriptionId string

@description('Short workload name used in resource names and tags.')
@minLength(3)
@maxLength(12)
param applicationName string

@description('Deployment environment.')
@allowed([
  'dev'
  'prod'
])
param environmentName string

@description('Primary Azure region for regional resources.')
param location string

@description('Stable short code for the selected Azure region.')
@minLength(2)
@maxLength(8)
param locationCode string

@description('Non-personal workload owner tag.')
param workloadOwner string

@description('Cost allocation tag.')
param costCenter string

@description('Additional non-secret environment tags.')
param additionalTags object = {}

@description('Whether Azure Static Web Apps preview staging environments are available.')
@allowed([
  'Disabled'
  'Enabled'
])
param frontendStagingEnvironmentPolicy string

@description('Full container image reference used by the future API revision.')
param apiContainerImage string

@description('Repository name reserved in Azure Container Registry for future API image publication.')
@minLength(1)
param apiImageRepository string

@description('Whether the Container App ingress is externally reachable.')
param apiIngressExternal bool

@description('Container port targeted by API ingress.')
@minValue(1)
@maxValue(65535)
param apiIngressTargetPort int

@description('API ingress transport protocol.')
@allowed([
  'auto'
  'http'
  'http2'
])
param apiIngressTransport string

@description('Minimum API replicas.')
@minValue(0)
param apiMinReplicas int

@description('Maximum API replicas.')
@minValue(1)
param apiMaxReplicas int

@description('Container CPU allocation expressed as a valid Container Apps decimal string.')
param apiCpuCores string

@description('Container memory allocation.')
param apiMemory string

@description('Concurrent HTTP requests targeted per API replica before scale-out.')
@minValue(1)
param apiHttpConcurrentRequests int

@description('Non-secret environment variables passed to the future API container.')
param apiEnvironmentVariables NonSecretEnvironmentVariable[] = []

@description('Environment variable names mapped to secure Container Apps secret references.')
param apiSecretEnvironmentReferences SecretEnvironmentReference[] = []

@description('Storage redundancy selected for asset blobs.')
@allowed([
  'Standard_LRS'
  'Standard_ZRS'
])
param assetStorageSkuName string

@description('Days that deleted asset blobs and containers remain recoverable.')
@minValue(1)
@maxValue(365)
param assetDeleteRetentionDays int

@description('Azure Front Door edge cache duration for immutable game assets.')
param gameAssetsCacheDuration string

@description('Azure Front Door edge cache duration for mutable user-facing media.')
param mediaCacheDuration string

@description('Azure Front Door edge cache duration for other static assets.')
param staticAssetsCacheDuration string

@description('Azure Front Door web application firewall enforcement mode.')
@allowed([
  'Detection'
  'Prevention'
])
param webApplicationFirewallMode string

@description('API requests allowed per socket IP address during the Azure Front Door rate-limit window.')
@minValue(1)
param apiRateLimitThreshold int

@description('Authentication requests allowed per socket IP address during the Azure Front Door rate-limit window.')
@minValue(1)
param authenticationRateLimitThreshold int

@description('All requests allowed per socket IP address during the Azure Front Door rate-limit window.')
@minValue(1)
param generalRateLimitThreshold int

@description('Fixed Azure Front Door rate-limit window in minutes.')
@allowed([
  1
  5
])
param rateLimitDurationInMinutes int

var resourceGroupName = 'rg-${applicationName}-${environmentName}-${locationCode}'
var assetPublisherFederatedSubject = 'repo:jdylanmc/game-hub:environment:${environmentName}'
var requiredTags = {
  application: applicationName
  costCenter: costCenter
  environment: environmentName
  managedBy: 'bicep'
  owner: workloadOwner
  repository: 'jdylanmc/game-hub'
}
var tags = union(additionalTags, requiredTags)

module resourceGroupModule './modules/resource-group.bicep' = {
  name: '${applicationName}-${environmentName}-resource-group'
  scope: subscription(targetSubscriptionId)
  params: {
    location: location
    name: resourceGroupName
    tags: tags
  }
}

module foundation './modules/foundation.bicep' = {
  name: '${applicationName}-${environmentName}-foundation'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    applicationName: applicationName
    environmentName: environmentName
    location: location
    locationCode: locationCode
    tags: tags
    targetSubscriptionId: targetSubscriptionId
  }
  dependsOn: [
    resourceGroupModule
  ]
}

module staticWebApp './modules/static-web-app.bicep' = {
  name: '${applicationName}-${environmentName}-static-web-app'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    location: location
    name: foundation.outputs.resourceNames.staticWebApp
    stagingEnvironmentPolicy: frontendStagingEnvironmentPolicy
    tags: tags
  }
}

module containerRegistry './modules/container-registry.bicep' = {
  name: '${applicationName}-${environmentName}-container-registry'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    apiImageRepository: apiImageRepository
    imagePullIdentityName: foundation.outputs.resourceNames.apiManagedIdentity
    location: location
    name: foundation.outputs.resourceNames.containerRegistry
    tags: tags
  }
}

module containerAppApi './modules/container-app-api.bicep' = {
  name: '${applicationName}-${environmentName}-container-app-api'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    appName: foundation.outputs.resourceNames.containerApp
    cpuCores: apiCpuCores
    environmentName: foundation.outputs.resourceNames.containerAppsEnvironment
    environmentVariables: apiEnvironmentVariables
    httpConcurrentRequests: apiHttpConcurrentRequests
    image: apiContainerImage
    imagePullIdentityId: containerRegistry.outputs.imagePullIdentityId
    ingressExternal: apiIngressExternal
    ingressTargetPort: apiIngressTargetPort
    ingressTransport: apiIngressTransport
    location: location
    maxReplicas: apiMaxReplicas
    memory: apiMemory
    minReplicas: apiMinReplicas
    registryLoginServer: containerRegistry.outputs.loginServer
    secretEnvironmentReferences: apiSecretEnvironmentReferences
    tags: tags
  }
}

module assetStorage './modules/asset-storage.bicep' = {
  name: '${applicationName}-${environmentName}-asset-storage'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    deleteRetentionDays: assetDeleteRetentionDays
    environmentName: environmentName
    location: location
    publisherFederatedSubject: assetPublisherFederatedSubject
    publisherIdentityName: foundation.outputs.resourceNames.assetPublisherManagedIdentity
    storageAccountName: foundation.outputs.resourceNames.storageAccount
    storageSkuName: assetStorageSkuName
    tags: tags
  }
}

module assetContentDelivery './modules/asset-content-delivery.bicep' = {
  name: '${applicationName}-${environmentName}-asset-content-delivery'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    endpointName: foundation.outputs.resourceNames.frontDoorEndpoint
    gameAssetsCacheDuration: gameAssetsCacheDuration
    mediaCacheDuration: mediaCacheDuration
    profileName: foundation.outputs.resourceNames.frontDoorProfile
    staticAssetsCacheDuration: staticAssetsCacheDuration
    storageAccountName: assetStorage.outputs.storageAccountName
    storageBlobHostName: replace(replace(assetStorage.outputs.blobEndpoint, 'https://', ''), '/', '')
    tags: tags
  }
}

module publicIngress './modules/public-ingress.bicep' = {
  name: '${applicationName}-${environmentName}-public-ingress'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    apiRateLimitThreshold: apiRateLimitThreshold
    authenticationRateLimitThreshold: authenticationRateLimitThreshold
    endpointName: foundation.outputs.resourceNames.frontDoorEndpoint
    generalRateLimitThreshold: generalRateLimitThreshold
    profileName: foundation.outputs.resourceNames.frontDoorProfile
    rateLimitDurationInMinutes: rateLimitDurationInMinutes
    staticWebAppHostName: staticWebApp.outputs.defaultHostname
    tags: tags
    webApplicationFirewallMode: webApplicationFirewallMode
    webApplicationFirewallPolicyName: foundation.outputs.resourceNames.webApplicationFirewallPolicy
  }
  dependsOn: [
    assetContentDelivery
  ]
}

module authenticationReadiness './modules/authentication-readiness.bicep' = {
  name: '${applicationName}-${environmentName}-authentication-readiness'
  scope: resourceGroup(targetSubscriptionId, resourceGroupName)
  params: {
    apiResourceId: containerAppApi.outputs.appId
    apiRuntimePrincipalId: containerAppApi.outputs.runtimePrincipalId
    backendRegion: location
    publicIngressHostName: publicIngress.outputs.endpointHostName
    staticWebAppHostName: staticWebApp.outputs.defaultHostname
    staticWebAppName: staticWebApp.outputs.name
    staticWebAppPrincipalId: staticWebApp.outputs.managedIdentityPrincipalId
  }
}

@description('Explicit Azure subscription selected for this environment.')
output subscriptionId string = targetSubscriptionId

@description('Regional location selected for resources.')
output location string = foundation.outputs.location

@description('Resource group that contains the environment.')
output resourceGroupName string = resourceGroupModule.outputs.name

@description('Resource group identifier used by deployment automation.')
output resourceGroupId string = resourceGroupModule.outputs.id

@description('Deterministic names reserved for later service modules.')
output resourceNames object = foundation.outputs.resourceNames

@description('Required environment tags applied by service modules.')
output tags object = foundation.outputs.tags

@description('Azure Static Web Apps resource identifier.')
output frontendResourceId string = staticWebApp.outputs.id

@description('Azure Static Web Apps resource name.')
output frontendResourceName string = staticWebApp.outputs.name

@description('Generated Azure Static Web Apps hostname.')
output frontendDefaultHostname string = staticWebApp.outputs.defaultHostname

@description('Public HTTPS endpoint for direct frontend diagnostics.')
output frontendEndpoint string = staticWebApp.outputs.endpoint

@description('Canonical Azure Front Door endpoint protected by the web application firewall.')
output publicEndpoint string = publicIngress.outputs.endpointUrl

@description('Non-secret frontend artifact publication contract.')
output frontendDeployment object = union(staticWebApp.outputs.deploymentConfiguration, {
  canonicalEndpoint: publicIngress.outputs.endpointUrl
  forwardingGatewayConfiguration: publicIngress.outputs.staticWebAppForwardingGatewayConfiguration
  resourceGroupName: resourceGroupModule.outputs.name
  staticWebAppName: staticWebApp.outputs.name
  subscriptionId: targetSubscriptionId
})

@description('System-assigned frontend managed identity principal identifier.')
output frontendManagedIdentityPrincipalId string = staticWebApp.outputs.managedIdentityPrincipalId

@description('Static Web Apps linked API backend resource identifier.')
output apiLinkedBackendId string = authenticationReadiness.outputs.linkedBackendId

@description('Stable same-origin API endpoint protected by Static Web Apps authentication.')
output authenticatedApiEndpoint string = authenticationReadiness.outputs.authenticatedApiEndpoint

@description('Non-secret frontend and API authentication configuration contract.')
output authenticationConfiguration object = authenticationReadiness.outputs.configuration

@description('Non-secret public ingress path, origin, managed-rule, and rate-limit contract.')
output publicIngressConfiguration object = publicIngress.outputs.configuration

@description('Azure Front Door web application firewall policy resource identifier.')
output webApplicationFirewallPolicyId string = publicIngress.outputs.webApplicationFirewallPolicyId

@description('Azure Front Door security policy resource identifier.')
output frontDoorSecurityPolicyId string = publicIngress.outputs.securityPolicyId

@description('Azure Front Door identifier required by Static Web Apps forwarding-gateway restrictions.')
output frontDoorId string = publicIngress.outputs.frontDoorId

@description('Azure Container Registry resource identifier.')
output registryResourceId string = containerRegistry.outputs.id

@description('Azure Container Registry resource name.')
output registryName string = containerRegistry.outputs.registryName

@description('Azure Container Registry login server.')
output registryLoginServer string = containerRegistry.outputs.loginServer

@description('Private registry repository reserved for future API image publication.')
output apiImageRepository string = containerRegistry.outputs.apiImageRepository

@description('Pull-only user-assigned managed identity resource identifier.')
output apiImagePullIdentityId string = containerRegistry.outputs.imagePullIdentityId

@description('Pull-only user-assigned managed identity client identifier.')
output apiImagePullIdentityClientId string = containerRegistry.outputs.imagePullIdentityClientId

@description('Pull-only user-assigned managed identity principal identifier.')
output apiImagePullIdentityPrincipalId string = containerRegistry.outputs.imagePullIdentityPrincipalId

@description('Deterministic AcrPull role assignment identifier for the pull-only identity.')
output apiImagePullRoleAssignmentId string = containerRegistry.outputs.imagePullRoleAssignmentId

@description('Azure Container Apps managed environment resource identifier.')
output apiEnvironmentResourceId string = containerAppApi.outputs.environmentId

@description('Azure Container Apps managed environment name.')
output apiEnvironmentName string = containerAppApi.outputs.environmentName

@description('Azure Container App resource identifier.')
output apiResourceId string = containerAppApi.outputs.appId

@description('Azure Container App resource name.')
output apiResourceName string = containerAppApi.outputs.appName

@description('Stable Container App ingress hostname across revisions.')
output apiDefaultHostname string = containerAppApi.outputs.fqdn

@description('Stable HTTPS endpoint for direct API diagnostics.')
output apiEndpoint string = containerAppApi.outputs.endpoint

@description('System-assigned API runtime identity principal identifier.')
output apiRuntimePrincipalId string = containerAppApi.outputs.runtimePrincipalId

@description('Non-secret API image, ingress, scaling, and publication contract.')
output apiDeployment object = union(containerAppApi.outputs.deploymentConfiguration, {
  imagePullIdentityId: containerRegistry.outputs.imagePullIdentityId
  imagePullRoleAssignmentId: containerRegistry.outputs.imagePullRoleAssignmentId
  privateImageRepository: containerRegistry.outputs.apiImageRepository
  registryLoginServer: containerRegistry.outputs.loginServer
  registryName: containerRegistry.outputs.registryName
  resourceGroupName: resourceGroupModule.outputs.name
  subscriptionId: targetSubscriptionId
})

@description('Asset storage account resource identifier.')
output assetStorageAccountId string = assetStorage.outputs.storageAccountId

@description('Asset storage account name.')
output assetStorageAccountName string = assetStorage.outputs.storageAccountName

@description('Microsoft Entra-authenticated Blob service endpoint.')
output assetBlobEndpoint string = assetStorage.outputs.blobEndpoint

@description('Private blob container names and resource identifiers by asset category.')
output assetContainers object = assetStorage.outputs.containers

@description('Asset publisher managed identity resource identifier.')
output assetPublisherIdentityId string = assetStorage.outputs.publisherIdentityId

@description('Asset publisher managed identity client identifier.')
output assetPublisherIdentityClientId string = assetStorage.outputs.publisherIdentityClientId

@description('Asset publisher managed identity principal identifier.')
output assetPublisherIdentityPrincipalId string = assetStorage.outputs.publisherIdentityPrincipalId

@description('OpenID Connect federated credential for asset publication.')
output assetPublisherFederatedCredentialId string = assetStorage.outputs.publisherFederatedCredentialId

@description('Storage Blob Data Contributor assignment for asset publication.')
output assetPublisherRoleAssignmentId string = assetStorage.outputs.publisherRoleAssignmentId

@description('Non-secret Microsoft Entra upload targets for game assets, media, and static assets.')
output assetUploadTargets object = assetStorage.outputs.uploadTargets

@description('Azure Front Door Premium profile resource identifier.')
output frontDoorProfileId string = assetContentDelivery.outputs.profileId

@description('Azure Front Door endpoint resource identifier.')
output frontDoorEndpointId string = assetContentDelivery.outputs.endpointId

@description('Azure Front Door endpoint hostname.')
output frontDoorEndpointHostName string = assetContentDelivery.outputs.endpointHostName

@description('Public content delivery endpoint.')
output contentEndpoint string = assetContentDelivery.outputs.endpointUrl

@description('Public content delivery endpoints by asset category.')
output assetContentEndpoints object = assetContentDelivery.outputs.categoryEndpoints

@description('Explicit edge caching contract by asset category.')
output assetCaching object = assetContentDelivery.outputs.caching

@description('Azure Front Door managed identity principal identifier.')
output frontDoorPrincipalId string = assetContentDelivery.outputs.profilePrincipalId

@description('Storage Blob Data Reader assignment for Azure Front Door.')
output frontDoorStorageReaderRoleAssignmentId string = assetContentDelivery.outputs.storageReaderRoleAssignmentId
