targetScope = 'resourceGroup'

metadata description = 'Extends the shared Azure Front Door endpoint into the canonical protected public ingress.'

@description('Existing Azure Front Door Premium profile name.')
param profileName string

@description('Existing Azure Front Door endpoint name.')
param endpointName string

@description('Azure Static Web Apps origin hostname without a scheme.')
param staticWebAppHostName string

@description('Azure Front Door web application firewall policy name.')
param webApplicationFirewallPolicyName string

@description('Required environment tags.')
param tags object

@description('Web application firewall enforcement mode.')
@allowed([
  'Detection'
  'Prevention'
])
param webApplicationFirewallMode string

@description('Number of matching API requests allowed per socket IP address during the rate-limit window.')
@minValue(1)
param apiRateLimitThreshold int

@description('Number of matching authentication requests allowed per socket IP address during the rate-limit window.')
@minValue(1)
param authenticationRateLimitThreshold int

@description('Number of all requests allowed per socket IP address during the rate-limit window.')
@minValue(1)
param generalRateLimitThreshold int

@description('Fixed Azure Front Door rate-limit window in minutes.')
@allowed([
  1
  5
])
param rateLimitDurationInMinutes int

var defaultRuleSetType = 'Microsoft_DefaultRuleSet'
var defaultRuleSetVersion = '2.1'
var botManagerRuleSetType = 'Microsoft_BotManagerRuleSet'
var botManagerRuleSetVersion = '1.1'
var webApplicationFirewallAssociationPattern = '/*'

resource profile 'Microsoft.Cdn/profiles@2025-01-01-preview' existing = {
  name: profileName
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-01-01-preview' existing = {
  name: endpointName
  parent: profile
}

resource frontendOriginGroup 'Microsoft.Cdn/profiles/originGroups@2025-01-01-preview' = {
  name: 'frontend'
  parent: profile
  properties: {
    healthProbeSettings: {
      probeIntervalInSeconds: 120
      probePath: '/'
      probeProtocol: 'Https'
      probeRequestType: 'HEAD'
    }
    loadBalancingSettings: {
      additionalLatencyInMilliseconds: 0
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    sessionAffinityState: 'Disabled'
  }
}

resource frontendOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2025-01-01-preview' = {
  name: 'static-web-app'
  parent: frontendOriginGroup
  properties: {
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
    hostName: staticWebAppHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: staticWebAppHostName
    priority: 1
    weight: 1000
  }
}

resource frontendRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-01-01-preview' = {
  name: 'frontend'
  parent: endpoint
  dependsOn: [
    frontendOrigin
  ]
  properties: {
    enabledState: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    originGroup: {
      id: frontendOriginGroup.id
    }
    patternsToMatch: [
      '/*'
    ]
    supportedProtocols: [
      'Http'
      'Https'
    ]
  }
}

resource webApplicationFirewallPolicy 'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2025-03-01' = {
  name: webApplicationFirewallPolicyName
  location: 'global'
  tags: tags
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    customRules: {
      rules: [
        {
          name: 'ApiRateLimit'
          action: 'Block'
          enabledState: 'Enabled'
          matchConditions: [
            {
              matchValue: [
                '/api'
              ]
              matchVariable: 'RequestUri'
              negateCondition: false
              operator: 'BeginsWith'
              transforms: [
                'Lowercase'
              ]
            }
          ]
          priority: 100
          rateLimitDurationInMinutes: rateLimitDurationInMinutes
          rateLimitThreshold: apiRateLimitThreshold
          ruleType: 'RateLimitRule'
        }
        {
          name: 'AuthenticationRateLimit'
          action: 'Block'
          enabledState: 'Enabled'
          matchConditions: [
            {
              matchValue: [
                '/account'
                '/.auth'
                '/login'
                '/logout'
              ]
              matchVariable: 'RequestUri'
              negateCondition: false
              operator: 'BeginsWith'
              transforms: [
                'Lowercase'
              ]
            }
          ]
          priority: 110
          rateLimitDurationInMinutes: rateLimitDurationInMinutes
          rateLimitThreshold: authenticationRateLimitThreshold
          ruleType: 'RateLimitRule'
        }
        {
          name: 'GeneralRateLimit'
          action: 'Block'
          enabledState: 'Enabled'
          matchConditions: [
            {
              matchValue: [
                '/'
              ]
              matchVariable: 'RequestUri'
              negateCondition: false
              operator: 'BeginsWith'
              transforms: [
                'Lowercase'
              ]
            }
          ]
          priority: 200
          rateLimitDurationInMinutes: rateLimitDurationInMinutes
          rateLimitThreshold: generalRateLimitThreshold
          ruleType: 'RateLimitRule'
        }
      ]
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: defaultRuleSetType
          ruleSetVersion: defaultRuleSetVersion
        }
        {
          ruleSetType: botManagerRuleSetType
          ruleSetVersion: botManagerRuleSetVersion
        }
      ]
    }
    policySettings: {
      enabledState: 'Enabled'
      mode: webApplicationFirewallMode
    }
  }
}

resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2025-01-01-preview' = {
  name: 'public-ingress'
  parent: profile
  dependsOn: [
    frontendRoute
  ]
  properties: {
    parameters: {
      associations: [
        {
          domains: [
            {
              id: endpoint.id
            }
          ]
          patternsToMatch: [
            webApplicationFirewallAssociationPattern
          ]
        }
      ]
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: webApplicationFirewallPolicy.id
      }
    }
  }
}

var endpointUrl = 'https://${endpoint.properties.hostName}'

@description('Canonical Azure Front Door endpoint hostname.')
output endpointHostName string = endpoint.properties.hostName

@description('Canonical protected public endpoint.')
output endpointUrl string = endpointUrl

@description('Azure Front Door identifier required by Static Web Apps forwarding-gateway restrictions.')
output frontDoorId string = profile.properties.frontDoorId

@description('Azure Front Door web application firewall policy resource identifier.')
output webApplicationFirewallPolicyId string = webApplicationFirewallPolicy.id

@description('Azure Front Door security policy resource identifier.')
output securityPolicyId string = securityPolicy.id

@description('Non-secret protected path, managed rule, rate limit, and origin-publication contract.')
output configuration object = {
  canonicalEndpoint: endpointUrl
  directOrigins: {
    api: {
      exposure: 'diagnostics-only'
      protection: 'Azure Static Web Apps linked-backend identity provider'
    }
    assets: {
      exposure: 'Microsoft Entra authorization required'
      protection: 'Anonymous and Shared Key access disabled'
    }
    frontend: {
      exposure: 'diagnostics-only until forwarding-gateway configuration is published'
      protection: 'AzureFrontDoor.Backend service tag and X-Azure-FDID forwarding header'
    }
  }
  managedRules: {
    botProtection: {
      type: botManagerRuleSetType
      version: botManagerRuleSetVersion
    }
    defaultProtection: {
      type: defaultRuleSetType
      version: defaultRuleSetVersion
    }
  }
  protectedPaths: {
    api: {
      endpoint: '${endpointUrl}/api'
      patterns: [
        '/api'
        '/api/*'
      ]
    }
    assets: {
      gameAssets: '${endpointUrl}/game-assets'
      media: '${endpointUrl}/media'
      staticAssets: '${endpointUrl}/static-assets'
    }
    authentication: {
      paths: [
        '/account'
        '/.auth/*'
        '/login'
        '/logout'
      ]
    }
    frontend: {
      endpoint: endpointUrl
      pattern: '/*'
    }
  }
  rateLimits: {
    api: {
      durationInMinutes: rateLimitDurationInMinutes
      thresholdPerSocketIp: apiRateLimitThreshold
    }
    authentication: {
      durationInMinutes: rateLimitDurationInMinutes
      thresholdPerSocketIp: authenticationRateLimitThreshold
    }
    general: {
      durationInMinutes: rateLimitDurationInMinutes
      thresholdPerSocketIp: generalRateLimitThreshold
    }
  }
  webApplicationFirewall: {
    associationPattern: webApplicationFirewallAssociationPattern
    mode: webApplicationFirewallMode
    policyId: webApplicationFirewallPolicy.id
    securityPolicyId: securityPolicy.id
  }
}

@description('Values that the frontend publisher must merge into staticwebapp.config.json after deployment.')
output staticWebAppForwardingGatewayConfiguration object = {
  forwardingGateway: {
    allowedForwardedHosts: [
      endpoint.properties.hostName
    ]
    requiredHeaders: {
      'X-Azure-FDID': profile.properties.frontDoorId
    }
  }
  networking: {
    allowedIpRanges: [
      'AzureFrontDoor.Backend'
    ]
  }
}
