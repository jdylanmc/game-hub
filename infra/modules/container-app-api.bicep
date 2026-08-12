targetScope = 'resourceGroup'

metadata description = 'Creates the Azure Container Apps environment and Game Hub API application boundary.'

type NonSecretEnvironmentVariable = {
  name: string
  value: string
}

type SecretEnvironmentReference = {
  name: string
  secretRef: string
}

type KeyVaultSecretReference = {
  name: string
  keyVaultSecretUri: string
}

@description('Azure Container Apps managed environment name.')
param environmentName string

@description('Azure Container App resource name.')
param appName string

@description('Azure region for the managed environment and container app.')
param location string

@description('Required environment tags.')
param tags object

@description('Full container image reference used by the API revision.')
param image string

@description('Azure Container Registry login server available to the API.')
param registryLoginServer string

@description('User-assigned managed identity resource identifier used only for registry image pulls.')
param imagePullIdentityId string

@description('User-assigned managed identity resource identifier used for API runtime access.')
param runtimeIdentityId string

@description('Whether the Container App ingress is externally reachable.')
param ingressExternal bool

@description('Container port targeted by ingress.')
@minValue(1)
@maxValue(65535)
param ingressTargetPort int

@description('Ingress transport protocol.')
@allowed([
  'auto'
  'http'
  'http2'
])
param ingressTransport string

@description('Minimum API replicas.')
@minValue(0)
param minReplicas int

@description('Maximum API replicas.')
@minValue(1)
param maxReplicas int

@description('Container CPU allocation expressed as a valid Container Apps decimal string.')
@allowed([
  '0.25'
  '0.5'
  '0.75'
  '1'
  '1.25'
  '1.5'
  '1.75'
  '2'
])
param cpuCores string

@description('Container memory allocation.')
@allowed([
  '0.5Gi'
  '1Gi'
  '1.5Gi'
  '2Gi'
  '2.5Gi'
  '3Gi'
  '3.5Gi'
  '4Gi'
])
param memory string

@description('Concurrent HTTP requests targeted per replica before scale-out.')
@minValue(1)
param httpConcurrentRequests int

@description('Non-secret environment variables passed to the API container.')
param environmentVariables NonSecretEnvironmentVariable[] = []

@description('Environment variable names mapped to Container Apps secret references created by a later secure-configuration deployment.')
param secretEnvironmentReferences SecretEnvironmentReference[] = []

@description('Container Apps secret names mapped to versionless Azure Key Vault secret URIs.')
param keyVaultSecretReferences KeyVaultSecretReference[] = []

var secretReferenceEnvironmentVariables = [
  for environmentVariable in secretEnvironmentReferences: {
    name: environmentVariable.name
    secretRef: environmentVariable.secretRef
  }
]

var keyVaultReferences = [
  for secretReference in keyVaultSecretReferences: {
    identity: runtimeIdentityId
    keyVaultUrl: secretReference.keyVaultSecretUri
    name: secretReference.name
  }
]

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned,UserAssigned'
    userAssignedIdentities: {
      '${imagePullIdentityId}': {}
      '${runtimeIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: ingressExternal
        targetPort: ingressTargetPort
        transport: ingressTransport
      }
      registries: [
        {
          identity: imagePullIdentityId
          server: registryLoginServer
        }
      ]
      secrets: keyVaultReferences
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          env: concat(environmentVariables, secretReferenceEnvironmentVariables)
          resources: {
            cpu: json(cpuCores)
            memory: memory
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: string(httpConcurrentRequests)
              }
            }
          }
        ]
      }
    }
  }
}

@description('Azure Container Apps managed environment resource identifier.')
output environmentId string = managedEnvironment.id

@description('Azure Container Apps managed environment name.')
output environmentName string = managedEnvironment.name

@description('Azure Container App resource identifier.')
output appId string = containerApp.id

@description('Azure Container App resource name.')
output appName string = containerApp.name

@description('Stable Container App ingress hostname across revisions.')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('Stable HTTPS endpoint for direct API diagnostics.')
output endpoint string = 'https://${containerApp.properties.configuration.ingress.fqdn}'

@description('System-assigned runtime identity principal identifier. No data-plane roles are granted by this module.')
output systemAssignedPrincipalId string = containerApp.identity.principalId

@description('User-assigned runtime identity resource identifier used for outbound workload access.')
output runtimeIdentityId string = runtimeIdentityId

@description('Non-secret API deployment configuration.')
output deploymentConfiguration object = {
  containerAppName: containerApp.name
  environmentName: managedEnvironment.name
  image: image
  ingress: {
    external: ingressExternal
    targetPort: ingressTargetPort
    transport: ingressTransport
  }
  scaling: {
    httpConcurrentRequests: httpConcurrentRequests
    maxReplicas: maxReplicas
    minReplicas: minReplicas
  }
  secureConfiguration: {
    keyVaultReferenceCount: length(keyVaultSecretReferences)
    runtimeIdentityId: runtimeIdentityId
    secretEnvironmentReferenceCount: length(secretEnvironmentReferences)
  }
}
