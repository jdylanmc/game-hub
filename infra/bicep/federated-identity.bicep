extension 'br:mcr.microsoft.com/bicep/extensions/microsoftgraph/v1.0:1.0.0'

targetScope = 'subscription'

@minLength(1)
@description('Immutable uniqueName of the existing Microsoft Entra ID application.')
param applicationUniqueName string

@minLength(1)
@description('Existing federated identity credential name.')
param credentialName string

@allowed([
  'adversarial-review'
  'test'
  'prod'
])
@description('Protected GitHub environment trusted by this credential.')
param githubEnvironment string

@description('GitHub repository owner login.')
param repositoryOwner string = 'jdylanmc'

@description('Immutable GitHub repository owner ID.')
param repositoryOwnerId string = '6954990'

@description('GitHub repository name.')
param repositoryName string = 'game-hub'

@description('Immutable GitHub repository ID.')
param repositoryId string = '1330993568'

var issuer = 'https://token.actions.githubusercontent.com'
var audience = 'api://AzureADTokenExchange'
var immutableSubject = 'repo:${repositoryOwner}@${repositoryOwnerId}/${repositoryName}@${repositoryId}:environment:${githubEnvironment}'

resource application 'Microsoft.Graph/applications@v1.0' existing = {
  uniqueName: applicationUniqueName
}

resource credential 'Microsoft.Graph/applications/federatedIdentityCredentials@v1.0' = {
  name: '${application.uniqueName}/${credentialName}'
  audiences: [
    audience
  ]
  description: 'GitHub Actions protected ${githubEnvironment} environment'
  issuer: issuer
  subject: immutableSubject
}

output credentialName string = credential.name
output issuer string = issuer
output subject string = immutableSubject
output audiences array = credential.audiences
