import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportedProviderTypes = ['Google', 'Facebook'];
const referenceNamePattern = /^[A-Z][A-Z0-9_]+$/;
const keyVaultNamePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])?$/;
const keyVaultSecretNamePattern = /^[0-9a-zA-Z-]{1,127}$/;

export function loadExternalIdSocialProviderConfiguration(root = rootDirectory) {
  return JSON.parse(readFileSync(path.join(root, 'config/authentication/external-id-social-providers.json'), 'utf8'));
}

export function validateExternalIdSocialProviderConfiguration(configuration) {
  const violations = [];

  if (configuration.schemaVersion !== 1) {
    violations.push('External ID social-provider configuration must use schema version 1.');
  }
  if (
    !Array.isArray(configuration.environments) ||
    configuration.environments.length === 0 ||
    configuration.environments.some((environment) => typeof environment !== 'string' || environment.length === 0)
  ) {
    violations.push('External ID social-provider configuration must declare supported environments.');
  }
  if (!configuration.credentialVault?.nameTemplate?.includes('{environment}')) {
    violations.push('The provider credential vault name must include the environment placeholder.');
  }

  const providers = Array.isArray(configuration.providers) ? configuration.providers : [];
  const providerTypes = providers.map((provider) => provider.identityProviderType);
  if (
    providers.length !== supportedProviderTypes.length ||
    supportedProviderTypes.some((providerType) => !providerTypes.includes(providerType)) ||
    new Set(providerTypes).size !== providerTypes.length
  ) {
    violations.push('External ID social-provider configuration must declare Google and Facebook exactly once.');
  }

  for (const provider of providers) {
    if (
      !supportedProviderTypes.includes(provider.identityProviderType) ||
      typeof provider.displayName !== 'string' ||
      provider.displayName.length === 0
    ) {
      violations.push('Every External ID social provider must use a supported type and display name.');
    }
    if (!referenceNamePattern.test(provider.clientIdEnvironmentVariable ?? '')) {
      violations.push(`The ${provider.identityProviderType ?? 'unknown'} client ID must use an environment reference.`);
    }
    if (!referenceNamePattern.test(provider.clientSecretEnvironmentVariable ?? '')) {
      violations.push(
        `The ${provider.identityProviderType ?? 'unknown'} client credential must use an environment reference.`,
      );
    }
    if (!keyVaultSecretNamePattern.test(provider.clientSecretKeyVaultSecretName ?? '')) {
      violations.push(
        `The ${provider.identityProviderType ?? 'unknown'} client credential must use an Azure Key Vault secret name.`,
      );
    }
  }

  for (const forbiddenKey of ['clientId', 'clientSecret', 'clientSecretValue', 'accessToken', 'connectionString']) {
    if (containsKey(configuration, forbiddenKey)) {
      violations.push(
        `External ID social-provider configuration contains forbidden credential field: ${forbiddenKey}.`,
      );
    }
  }

  return violations;
}

export function resolveExternalIdSocialProviderReferences(configuration, { environment }) {
  assertConfiguration(configuration, environment);
  const keyVaultName = configuration.credentialVault.nameTemplate.replaceAll('{environment}', environment);
  if (!keyVaultNamePattern.test(keyVaultName)) {
    throw new Error('External ID provider credential vault name is invalid.');
  }

  return {
    keyVaultName,
    providers: configuration.providers.map((provider) => ({
      clientIdEnvironmentVariable: provider.clientIdEnvironmentVariable,
      clientSecretEnvironmentVariable: provider.clientSecretEnvironmentVariable,
      clientSecretKeyVaultSecretName: provider.clientSecretKeyVaultSecretName,
      identityProviderType: provider.identityProviderType,
    })),
  };
}

export function buildExternalIdSocialProviderState(
  configuration,
  { environment, environmentVariables = process.env, userFlowDisplayName },
) {
  const references = resolveExternalIdSocialProviderReferences(configuration, { environment });
  if (typeof userFlowDisplayName !== 'string' || userFlowDisplayName.length === 0) {
    throw new Error('External ID social providers require the shared user-flow display name.');
  }

  return {
    providers: configuration.providers.map((provider) => ({
      clientId: requiredReferencedValue(environmentVariables, provider.clientIdEnvironmentVariable),
      clientSecret: requiredReferencedValue(environmentVariables, provider.clientSecretEnvironmentVariable),
      displayName: provider.displayName,
      identityProviderType: provider.identityProviderType,
    })),
    references,
    userFlowDisplayName,
  };
}

export async function reconcileExternalIdSocialProviders(graph, desiredState, { userFlowId }) {
  if (typeof userFlowId !== 'string' || userFlowId.length === 0) {
    throw new Error('External ID social-provider reconciliation requires the shared user-flow ID.');
  }

  const changes = [];
  const existingProviders = collection(
    await graph.request('/identity/identityProviders?$select=id,displayName,identityProviderType,clientId'),
  );
  const resolvedProviders = [];

  for (const desiredProvider of desiredState.providers) {
    const matchingProviders = existingProviders.filter(
      (provider) => provider.identityProviderType === desiredProvider.identityProviderType,
    );
    if (matchingProviders.length > 1) {
      throw new Error(`Multiple External ID providers use the type "${desiredProvider.identityProviderType}".`);
    }

    let providerId = matchingProviders[0]?.id;
    if (!providerId) {
      const created = await graph.request('/identity/identityProviders', {
        body: {
          '@odata.type': 'microsoft.graph.socialIdentityProvider',
          clientId: desiredProvider.clientId,
          clientSecret: desiredProvider.clientSecret,
          displayName: desiredProvider.displayName,
          identityProviderType: desiredProvider.identityProviderType,
        },
        method: 'POST',
      });
      providerId = created?.id;
      changes.push(`created-${desiredProvider.identityProviderType.toLowerCase()}-provider`);
    } else {
      await graph.request(`/identity/identityProviders/${encodeURIComponent(providerId)}`, {
        body: {
          '@odata.type': '#microsoft.graph.socialIdentityProvider',
          clientId: desiredProvider.clientId,
          clientSecret: desiredProvider.clientSecret,
          displayName: desiredProvider.displayName,
        },
        method: 'PATCH',
      });
      changes.push(`synchronized-${desiredProvider.identityProviderType.toLowerCase()}-provider`);
    }

    if (typeof providerId !== 'string' || providerId.length === 0) {
      throw new Error(`Microsoft Graph did not return the ${desiredProvider.identityProviderType} provider ID.`);
    }
    resolvedProviders.push({
      id: providerId,
      identityProviderType: desiredProvider.identityProviderType,
    });
  }

  const userFlowPath = `/identity/authenticationEventsFlows/${encodeURIComponent(
    userFlowId,
  )}?$select=id,displayName,onAuthenticationMethodLoadStart`;
  const userFlow = await graph.request(userFlowPath);
  if (userFlow?.displayName !== desiredState.userFlowDisplayName) {
    throw new Error('The resolved External ID user flow does not match the social-provider desired state.');
  }

  const currentProviderIds = collection(userFlow.onAuthenticationMethodLoadStart?.identityProviders).map(
    (provider) => provider.id,
  );
  const providerIds = [...new Set([...currentProviderIds, ...resolvedProviders.map((provider) => provider.id)])];
  if (providerIds.length !== currentProviderIds.length) {
    await graph.request(`/identity/authenticationEventsFlows/${encodeURIComponent(userFlowId)}`, {
      body: {
        onAuthenticationMethodLoadStart: {
          '@odata.type': '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp',
          identityProviders: providerIds.map((id) => ({ id })),
        },
      },
      method: 'PATCH',
    });
    changes.push('updated-user-flow-providers');
  }

  return {
    changes,
    providers: resolvedProviders,
    userFlowDisplayName: desiredState.userFlowDisplayName,
    userFlowId,
  };
}

function assertConfiguration(configuration, environment) {
  const violations = validateExternalIdSocialProviderConfiguration(configuration);
  if (violations.length > 0) {
    throw new Error(violations.join('\n'));
  }
  if (!configuration.environments.includes(environment)) {
    throw new Error(`Unsupported External ID environment: ${environment}.`);
  }
}

function requiredReferencedValue(environmentVariables, name) {
  const value = environmentVariables[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function collection(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.value) ? value.value : [];
}

function containsKey(value, forbiddenKey) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => key === forbiddenKey || containsKey(child, forbiddenKey));
}
