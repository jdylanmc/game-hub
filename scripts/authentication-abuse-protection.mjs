import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environments = ['dev', 'prod'];
const protectedPaths = ['/account', '/.auth', '/login', '/logout'];

export function loadAuthenticationAbuseProtectionConfiguration(root = rootDirectory) {
  return JSON.parse(
    readFileSync(path.join(root, 'config/authentication/authentication-abuse-protection.json'), 'utf8'),
  );
}

export function validateAuthenticationAbuseProtectionConfiguration(configuration) {
  const violations = [];

  if (configuration.schemaVersion !== 1) {
    violations.push('Authentication abuse protection must use schema version 1.');
  }

  const configuredPaths = configuration.edge?.protectedPaths;
  if (
    !Array.isArray(configuredPaths) ||
    configuredPaths.length !== protectedPaths.length ||
    protectedPaths.some((protectedPath) => !configuredPaths.includes(protectedPath))
  ) {
    violations.push('Authentication abuse protection must cover account, managed auth, login, and logout paths.');
  }

  const managedRules = configuration.edge?.managedRules;
  if (
    managedRules?.defaultProtection?.type !== 'Microsoft_DefaultRuleSet' ||
    managedRules.defaultProtection.version !== '2.1' ||
    managedRules?.botProtection?.type !== 'Microsoft_BotManagerRuleSet' ||
    managedRules.botProtection.version !== '1.1'
  ) {
    violations.push('Authentication abuse protection must retain the reviewed default and bot managed rule sets.');
  }

  const environmentConfiguration = configuration.edge?.environments;
  if (
    !environmentConfiguration ||
    Object.keys(environmentConfiguration).length !== environments.length ||
    environments.some((environment) => !environmentConfiguration[environment])
  ) {
    violations.push('Authentication abuse protection must declare dev and prod edge controls.');
  } else {
    for (const environment of environments) {
      const settings = environmentConfiguration[environment];
      if (
        !Number.isInteger(settings.durationInMinutes) ||
        settings.durationInMinutes !== 5 ||
        !Number.isInteger(settings.thresholdPerSocketIp) ||
        settings.thresholdPerSocketIp < 1
      ) {
        violations.push(`The ${environment} authentication rate limit must use a positive five-minute threshold.`);
      }
    }
    if (environmentConfiguration.dev.mode !== 'Detection') {
      violations.push('Development authentication protection must use detection mode for tuning.');
    }
    if (environmentConfiguration.prod.mode !== 'Prevention') {
      violations.push('Production authentication protection must use prevention mode.');
    }
    if (environmentConfiguration.prod.thresholdPerSocketIp >= environmentConfiguration.dev.thresholdPerSocketIp) {
      violations.push('Production authentication rate limiting must be stricter than development.');
    }
  }

  const identityService = configuration.identityService;
  if (
    identityService?.authenticationSurface !== 'browser-delegated' ||
    identityService.credentialProcessor !== 'microsoft-entra-external-id' ||
    identityService.smartLockout !== 'enabled-by-default' ||
    identityService.commonNetworkingHttpProtection !== 'enabled-by-default'
  ) {
    violations.push('Microsoft Entra External ID must retain browser-delegated baseline attack protections.');
  }
  if (
    identityService?.gameHubReceivesPlaintextPasswords !== false ||
    identityService.gameHubStoresPlaintextPasswords !== false ||
    identityService.browserConfigurationContainsSensitiveValues !== false
  ) {
    violations.push('Authentication protection must keep credentials and sensitive values outside Game Hub.');
  }

  for (const forbiddenKey of [
    'accessToken',
    'clientSecret',
    'connectionString',
    'passwordValue',
    'providerCredential',
    'sessionToken',
  ]) {
    if (containsKey(configuration, forbiddenKey)) {
      violations.push(`Authentication abuse protection contains forbidden sensitive field: ${forbiddenKey}.`);
    }
  }

  return violations;
}

function containsKey(value, forbiddenKey) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => key === forbiddenKey || containsKey(child, forbiddenKey));
}
