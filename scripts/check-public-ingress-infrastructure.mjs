import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAuthenticationAbuseProtectionConfiguration,
  validateAuthenticationAbuseProtectionConfiguration,
} from './authentication-abuse-protection.mjs';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadPublicIngressInfrastructure(root = rootDirectory) {
  return {
    assetContentDeliveryModule: readFileSync(path.join(root, 'infra/modules/asset-content-delivery.bicep'), 'utf8'),
    authenticationModule: readFileSync(path.join(root, 'infra/modules/authentication-readiness.bicep'), 'utf8'),
    authenticationProtectionConfiguration: loadAuthenticationAbuseProtectionConfiguration(root),
    environmentParameters: Object.fromEntries(
      ['dev', 'prod'].map((environment) => [
        environment,
        readFileSync(path.join(root, `infra/environments/${environment}.bicepparam`), 'utf8'),
      ]),
    ),
    mainTemplate: readFileSync(path.join(root, 'infra/main.bicep'), 'utf8'),
    publicIngressModule: readFileSync(path.join(root, 'infra/modules/public-ingress.bicep'), 'utf8'),
  };
}

export function validatePublicIngressInfrastructure({
  assetContentDeliveryModule,
  authenticationModule,
  authenticationProtectionConfiguration,
  environmentParameters,
  mainTemplate,
  publicIngressModule,
}) {
  const violations = [];
  violations.push(...validateAuthenticationAbuseProtectionConfiguration(authenticationProtectionConfiguration));

  for (const [needle, message] of [
    [
      'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2025-03-01',
      'The ingress must declare a web application firewall policy.',
    ],
    ['ruleSetType: defaultRuleSetType', 'The managed default web application firewall rule set must be enabled.'],
    ['ruleSetType: botManagerRuleSetType', 'The managed bot protection rule set must be enabled.'],
    ["var defaultRuleSetVersion = '2.1'", 'The default managed rule set version must remain explicit.'],
    ["var botManagerRuleSetVersion = '1.1'", 'The bot protection rule set version must remain explicit.'],
    ["name: 'ApiRateLimit'", 'The API must have an explicit rate limit.'],
    ["name: 'AuthenticationRateLimit'", 'Authentication paths must have an explicit rate limit.'],
    [
      "matchValue: [\n                '/account'\n                '/.auth'",
      'Authentication rate limiting must cover the account entry page.',
    ],
    ["'/.auth/*'", 'The protected authentication contract must cover managed authentication endpoints.'],
    ["name: 'GeneralRateLimit'", 'General frontend and asset traffic must have an explicit rate limit.'],
    ["ruleType: 'RateLimitRule'", 'Rate limiting must use Azure Front Door web application firewall rules.'],
    ["matchVariable: 'RequestUri'", 'Rate limits must be scoped by request path.'],
    [
      'patternsToMatch: [\n            webApplicationFirewallAssociationPattern',
      'The security policy must protect all routes.',
    ],
    [
      "var webApplicationFirewallAssociationPattern = '/*'",
      'The web application firewall association must cover every ingress path.',
    ],
    ["pattern: '/*'", 'The frontend must be mapped through the protected endpoint.'],
    ["'/api/*'", 'The API path must be mapped through the protected endpoint.'],
    ["gameAssets: '${endpointUrl}/game-assets'", 'Game assets must be mapped through the protected endpoint.'],
    ["media: '${endpointUrl}/media'", 'Media must be mapped through the protected endpoint.'],
    ["staticAssets: '${endpointUrl}/static-assets'", 'Static assets must be mapped through the protected endpoint.'],
    [
      "'X-Azure-FDID': profile.properties.frontDoorId",
      'The Static Web Apps forwarding-gateway contract must bind to this Front Door profile.',
    ],
    [
      "'AzureFrontDoor.Backend'",
      'The Static Web Apps forwarding-gateway contract must restrict origin traffic to Front Door.',
    ],
  ]) {
    requireText(publicIngressModule, needle, message, violations);
  }

  requireText(
    assetContentDeliveryModule,
    "name: 'Premium_AzureFrontDoor'",
    'The shared ingress profile must retain Azure Front Door Premium.',
    violations,
  );

  for (const [needle, message] of [
    [
      "module publicIngress './modules/public-ingress.bicep'",
      'The entry point must compose the public ingress module.',
    ],
    [
      'publicIngressHostName: publicIngress.outputs.endpointHostName',
      'Authentication must use the protected hostname.',
    ],
    ['output publicEndpoint string', 'The canonical protected endpoint must be exposed.'],
    ['output publicIngressConfiguration object', 'The protected path and policy contract must be exposed.'],
    ['output webApplicationFirewallPolicyId string', 'The web application firewall policy identifier must be exposed.'],
  ]) {
    requireText(mainTemplate, needle, message, violations);
  }

  requireText(
    authenticationModule,
    "var frontendEndpoint = 'https://${publicIngressHostName}'",
    'Authentication and API browser endpoints must use Azure Front Door.',
    violations,
  );

  for (const [environment, parameters] of Object.entries(environmentParameters)) {
    const edgeSettings = authenticationProtectionConfiguration.edge.environments[environment];
    for (const needle of [
      'param apiRateLimitThreshold = ',
      `param authenticationRateLimitThreshold = ${edgeSettings.thresholdPerSocketIp}`,
      'param generalRateLimitThreshold = ',
      `param rateLimitDurationInMinutes = ${edgeSettings.durationInMinutes}`,
      `param webApplicationFirewallMode = '${edgeSettings.mode}'`,
    ]) {
      requireText(parameters, needle, `The ${environment} environment must define ${needle.trim()}.`, violations);
    }
  }

  requireText(
    environmentParameters.dev,
    "param webApplicationFirewallMode = 'Detection'",
    'Development must start in detection mode for tuning.',
    violations,
  );
  requireText(
    environmentParameters.prod,
    "param webApplicationFirewallMode = 'Prevention'",
    'Production must enforce prevention mode.',
    violations,
  );

  const ingressSources = `${publicIngressModule}\n${mainTemplate}\n${Object.values(environmentParameters).join('\n')}`;
  for (const forbidden of [
    /clientSecret/i,
    /connectionString/i,
    /sharedAccessSignature/i,
    /accountKey/i,
    /repositoryToken/i,
  ]) {
    if (forbidden.test(ingressSources)) {
      violations.push(`Public ingress infrastructure contains forbidden credential field: ${forbidden.source}.`);
    }
  }

  return violations;
}

function requireText(source, needle, message, violations) {
  if (!source.includes(needle)) violations.push(message);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const violations = validatePublicIngressInfrastructure(loadPublicIngressInfrastructure());
  if (violations.length > 0) {
    throw new Error(`Public ingress infrastructure policy failed:\n- ${violations.join('\n- ')}`);
  }
  console.log('Public ingress infrastructure policy passed.');
}
