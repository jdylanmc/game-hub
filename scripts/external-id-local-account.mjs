import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tenantSubdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const keyVaultCertificateReferencePattern =
  /^@Microsoft\.KeyVault\(SecretUri=https:\/\/[a-z0-9-]+\.vault\.azure\.net\/certificates\/[a-zA-Z0-9-]+(?:\/[a-fA-F0-9]+)?\)$/;

export function loadExternalIdLocalAccountConfiguration(root = rootDirectory) {
  return JSON.parse(readFileSync(path.join(root, 'config/authentication/external-id-local-account.json'), 'utf8'));
}

export function validateExternalIdLocalAccountConfiguration(configuration) {
  const violations = [];

  if (configuration.schemaVersion !== 1) {
    violations.push('External ID local-account configuration must use schema version 1.');
  }
  if (
    !Array.isArray(configuration.environments) ||
    configuration.environments.length === 0 ||
    configuration.environments.some((environment) => typeof environment !== 'string' || environment.length === 0)
  ) {
    violations.push('External ID local-account configuration must declare supported environments.');
  }
  if (!configuration.userFlow?.displayName?.includes('{environment}')) {
    violations.push('The External ID user-flow display name must include the environment placeholder.');
  }
  if (configuration.userFlow?.emailPasswordProviderId !== 'EmailPassword-OAUTH') {
    violations.push('The local-account user flow must use the External ID email-and-password provider.');
  }
  if (configuration.userFlow?.signUpAllowed !== true) {
    violations.push('The local-account user flow must allow self-service sign-up.');
  }
  if (!configuration.userFlow?.attributes?.some((attribute) => attribute.id === 'email')) {
    violations.push('The local-account user flow must collect the verified email attribute.');
  }
  if (
    configuration.passwordReset?.authenticationMethodConfigurationId !== 'email' ||
    configuration.passwordReset?.state !== 'enabled' ||
    configuration.passwordReset?.allowExternalIdToUseEmailOtp !== 'enabled'
  ) {
    violations.push('Self-service password reset must use enabled External ID email one-time passcodes.');
  }
  if (
    configuration.staticWebApps?.clientIdSettingName !== 'GAME_HUB_EXTERNAL_ID_CLIENT_ID' ||
    configuration.staticWebApps?.providerRoute !== 'aad'
  ) {
    violations.push('Static Web Apps must use the non-secret External ID client setting and aad provider route.');
  }
  if (
    configuration.credentialHandling?.processor !== 'microsoft-entra-external-id' ||
    configuration.credentialHandling?.emailVerification !== 'email-one-time-passcode' ||
    configuration.credentialHandling?.passwordReset !== 'self-service-email-one-time-passcode' ||
    configuration.credentialHandling?.gameHubReceivesPlaintextPassword !== false ||
    configuration.credentialHandling?.gameHubStoresPlaintextPassword !== false
  ) {
    violations.push('Microsoft Entra External ID must exclusively process and store local-account credentials.');
  }

  for (const forbiddenKey of ['clientSecret', 'clientSecretValue', 'accessToken', 'connectionString']) {
    if (containsKey(configuration, forbiddenKey)) {
      violations.push(`External ID configuration contains forbidden credential field: ${forbiddenKey}.`);
    }
  }

  return violations;
}

export function buildExternalIdLocalAccountState(configuration, { applicationId, environment }) {
  const violations = validateExternalIdLocalAccountConfiguration(configuration);
  if (violations.length > 0) {
    throw new Error(violations.join('\n'));
  }
  if (!configuration.environments.includes(environment)) {
    throw new Error(`Unsupported External ID environment: ${environment}.`);
  }
  assertGuid(applicationId, 'External ID application ID');

  const userFlowDisplayName = configuration.userFlow.displayName.replaceAll('{environment}', environment);
  const attributes = configuration.userFlow.attributes.map(
    ({ dataType, description, displayName, id, userFlowAttributeType }) => ({
      dataType,
      description,
      displayName,
      id,
      userFlowAttributeType,
    }),
  );
  const inputs = configuration.userFlow.attributes.map(({ id, input }) => ({
    attribute: id,
    ...input,
  }));

  return {
    applicationId,
    emailPasswordProviderId: configuration.userFlow.emailPasswordProviderId,
    passwordResetBody: {
      '@odata.type': '#microsoft.graph.emailAuthenticationMethodConfiguration',
      allowExternalIdToUseEmailOtp: configuration.passwordReset.allowExternalIdToUseEmailOtp,
      state: configuration.passwordReset.state,
    },
    userFlowBody: {
      '@odata.type': '#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow',
      displayName: userFlowDisplayName,
      description: configuration.userFlow.description,
      onAuthenticationMethodLoadStart: {
        '@odata.type': '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp',
        identityProviders: [{ id: configuration.userFlow.emailPasswordProviderId }],
      },
      onInteractiveAuthFlowStart: {
        '@odata.type': '#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp',
        isSignUpAllowed: true,
      },
      onAttributeCollection: {
        '@odata.type': '#microsoft.graph.onAttributeCollectionExternalUsersSelfServiceSignUp',
        attributes,
        attributeCollectionPage: {
          views: [{ inputs }],
        },
      },
    },
    userFlowDisplayName,
  };
}

export async function reconcileExternalIdLocalAccount(graph, desiredState) {
  const changes = [];
  const providers = collection(
    await graph.request('/identity/identityProviders?$select=id,displayName,identityProviderType'),
  );
  if (!providers.some((provider) => provider.id === desiredState.emailPasswordProviderId)) {
    throw new Error('Microsoft Entra External ID does not expose the EmailPassword-OAUTH identity provider.');
  }

  const flows = collection(
    await graph.request(
      '/identity/authenticationEventsFlows?$select=id,displayName,onAuthenticationMethodLoadStart,onInteractiveAuthFlowStart',
    ),
  ).filter((flow) => flow.displayName === desiredState.userFlowDisplayName);
  if (flows.length > 1) {
    throw new Error(`Multiple External ID user flows use the display name "${desiredState.userFlowDisplayName}".`);
  }

  let userFlow = flows[0];
  if (!userFlow) {
    userFlow = await graph.request('/identity/authenticationEventsFlows', {
      body: desiredState.userFlowBody,
      method: 'POST',
    });
    changes.push('created-user-flow');
  } else {
    const currentProviderIds = collection(userFlow.onAuthenticationMethodLoadStart?.identityProviders).map(
      (provider) => provider.id,
    );
    const providerIds = [...new Set([...currentProviderIds, desiredState.emailPasswordProviderId])];
    const signUpAllowed = userFlow.onInteractiveAuthFlowStart?.isSignUpAllowed === true;

    if (!currentProviderIds.includes(desiredState.emailPasswordProviderId) || !signUpAllowed) {
      await graph.request(`/identity/authenticationEventsFlows/${encodeURIComponent(userFlow.id)}`, {
        body: {
          onAuthenticationMethodLoadStart: {
            '@odata.type': '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp',
            identityProviders: providerIds.map((id) => ({ id })),
          },
          onInteractiveAuthFlowStart: {
            '@odata.type': '#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp',
            isSignUpAllowed: true,
          },
        },
        method: 'PATCH',
      });
      changes.push('updated-user-flow');
    }
  }

  if (!userFlow?.id) {
    throw new Error('Microsoft Graph did not return the configured External ID user-flow ID.');
  }

  const includeApplicationsPath = `/identity/authenticationEventsFlows/${encodeURIComponent(
    userFlow.id,
  )}/conditions/applications/includeApplications`;
  const linkedApplications = collection(await graph.request(`${includeApplicationsPath}?$select=appId`));
  if (!linkedApplications.some((application) => application.appId === desiredState.applicationId)) {
    await graph.request(includeApplicationsPath, {
      body: {
        '@odata.type': '#microsoft.graph.authenticationConditionApplication',
        appId: desiredState.applicationId,
      },
      method: 'POST',
    });
    changes.push('linked-application');
  }

  const passwordResetPath = '/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/email';
  const passwordReset = await graph.request(passwordResetPath);
  if (
    passwordReset?.state !== desiredState.passwordResetBody.state ||
    passwordReset?.allowExternalIdToUseEmailOtp !== desiredState.passwordResetBody.allowExternalIdToUseEmailOtp
  ) {
    await graph.request(passwordResetPath, {
      body: desiredState.passwordResetBody,
      method: 'PATCH',
    });
    changes.push('enabled-password-reset');
  }

  return {
    applicationId: desiredState.applicationId,
    changes,
    userFlowId: userFlow.id,
    userFlowDisplayName: desiredState.userFlowDisplayName,
  };
}

export function renderStaticWebAppExternalIdAuthentication(
  staticWebAppConfiguration,
  configuration,
  { certificateKeyVaultReference, clientId, tenantId, tenantSubdomain },
) {
  const violations = validateExternalIdLocalAccountConfiguration(configuration);
  if (violations.length > 0) {
    throw new Error(violations.join('\n'));
  }
  assertGuid(clientId, 'External ID application client ID');
  assertGuid(tenantId, 'External ID tenant ID');
  if (!tenantSubdomainPattern.test(tenantSubdomain)) {
    throw new Error('External ID tenant subdomain is invalid.');
  }
  if (!keyVaultCertificateReferencePattern.test(certificateKeyVaultReference)) {
    throw new Error('External ID certificate must be an Azure Key Vault certificate reference.');
  }

  const rendered = structuredClone(staticWebAppConfiguration);
  rendered.auth ??= {};
  rendered.auth.identityProviders ??= {};
  rendered.auth.identityProviders.azureActiveDirectory = {
    registration: {
      openIdIssuer: `https://${tenantSubdomain}.ciamlogin.com/${tenantId}/v2.0`,
      clientIdSettingName: configuration.staticWebApps.clientIdSettingName,
      clientSecretCertificateKeyVaultReference: certificateKeyVaultReference,
      clientSecretCertificateThumbprint: '*',
    },
  };

  return rendered;
}

export class MicrosoftGraphClient {
  constructor(accessTokenProvider, fetchImplementation = globalThis.fetch) {
    this.accessTokenProvider = accessTokenProvider;
    this.fetchImplementation = fetchImplementation;
  }

  async request(requestPath, { body, method = 'GET' } = {}) {
    const accessToken = await this.accessTokenProvider();
    const response = await this.fetchImplementation(`https://graph.microsoft.com/v1.0${requestPath}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      method,
    });

    if (!response.ok) {
      let graphCode = 'unknown';
      try {
        graphCode = (await response.json())?.error?.code ?? graphCode;
      } catch {
        // The status and Graph error code are sufficient and avoid retaining response content.
      }
      throw new Error(`Microsoft Graph request failed (${response.status}, ${graphCode}).`);
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  }
}

function assertGuid(value, label) {
  if (!guidPattern.test(value)) {
    throw new Error(`${label} must be a GUID.`);
  }
}

function collection(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.value) ? value.value : [];
}

function containsKey(value, forbiddenKey) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => key === forbiddenKey || containsKey(child, forbiddenKey));
}
