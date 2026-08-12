import { describe, expect, it } from 'vitest';
import {
  buildExternalIdLocalAccountState,
  loadExternalIdLocalAccountConfiguration,
  reconcileExternalIdLocalAccount,
  renderStaticWebAppExternalIdAuthentication,
  validateExternalIdLocalAccountConfiguration,
} from './external-id-local-account.mjs';

const applicationId = '63856651-13d9-4784-9abf-20758d509e19';
const tenantId = '3856f5f5-4bae-464a-9044-b72dc2dcde26';
const configuration = loadExternalIdLocalAccountConfiguration();

describe('External ID local-account configuration', () => {
  it('declares hosted email registration, verification, and password reset without application passwords', () => {
    expect(validateExternalIdLocalAccountConfiguration(configuration)).toEqual([]);

    const desired = buildExternalIdLocalAccountState(configuration, {
      applicationId,
      environment: 'dev',
    });

    expect(desired.userFlowBody.onAuthenticationMethodLoadStart.identityProviders).toEqual([
      { id: 'EmailPassword-OAUTH' },
    ]);
    expect(desired.userFlowBody.onInteractiveAuthFlowStart.isSignUpAllowed).toBe(true);
    expect(desired.passwordResetBody).toMatchObject({
      allowExternalIdToUseEmailOtp: 'enabled',
      state: 'enabled',
    });
    expect(configuration.credentialHandling).toMatchObject({
      gameHubReceivesPlaintextPassword: false,
      gameHubStoresPlaintextPassword: false,
    });
  });

  it('creates and links the local account flow and enables self-service reset', async () => {
    const desired = buildExternalIdLocalAccountState(configuration, {
      applicationId,
      environment: 'dev',
    });
    const graph = new FakeGraph([
      { value: [{ id: 'EmailPassword-OAUTH' }] },
      { value: [] },
      { id: 'flow-id', displayName: desired.userFlowDisplayName },
      { value: [] },
      { id: 'link-id' },
      {
        '@odata.type': '#microsoft.graph.emailAuthenticationMethodConfiguration',
        allowExternalIdToUseEmailOtp: 'disabled',
        state: 'disabled',
      },
      null,
    ]);

    const result = await reconcileExternalIdLocalAccount(graph, desired);

    expect(result).toMatchObject({
      applicationId,
      changes: ['created-user-flow', 'linked-application', 'enabled-password-reset'],
      userFlowId: 'flow-id',
    });
    expect(graph.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/identity/authenticationEventsFlows' }),
        expect.objectContaining({
          method: 'POST',
          path: '/identity/authenticationEventsFlows/flow-id/conditions/applications/includeApplications',
        }),
        expect.objectContaining({
          method: 'PATCH',
          path: '/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/email',
        }),
      ]),
    );
  });

  it('preserves later identity providers while restoring local sign-up', async () => {
    const desired = buildExternalIdLocalAccountState(configuration, {
      applicationId,
      environment: 'prod',
    });
    const graph = new FakeGraph([
      { value: [{ id: 'EmailPassword-OAUTH' }] },
      {
        value: [
          {
            id: 'flow-id',
            displayName: desired.userFlowDisplayName,
            onAuthenticationMethodLoadStart: {
              identityProviders: [{ id: 'Google-OAUTH' }],
            },
            onInteractiveAuthFlowStart: { isSignUpAllowed: false },
          },
        ],
      },
      null,
      { value: [{ appId: applicationId }] },
      {
        allowExternalIdToUseEmailOtp: 'enabled',
        state: 'enabled',
      },
    ]);

    const result = await reconcileExternalIdLocalAccount(graph, desired);
    const update = graph.calls.find(
      (call) => call.method === 'PATCH' && call.path === '/identity/authenticationEventsFlows/flow-id',
    );

    expect(result.changes).toEqual(['updated-user-flow']);
    expect(update.body.onAuthenticationMethodLoadStart.identityProviders).toEqual([
      { id: 'Google-OAUTH' },
      { id: 'EmailPassword-OAUTH' },
    ]);
  });

  it('renders a tenant-scoped certificate-backed Static Web Apps provider', () => {
    const rendered = renderStaticWebAppExternalIdAuthentication({ routes: [] }, configuration, {
      certificateKeyVaultReference:
        '@Microsoft.KeyVault(SecretUri=https://gamehub-dev.vault.azure.net/certificates/external-id)',
      clientId: applicationId,
      tenantId,
      tenantSubdomain: 'gamehub-dev',
    });

    expect(rendered.auth.identityProviders.azureActiveDirectory.registration).toEqual({
      openIdIssuer: `https://gamehub-dev.ciamlogin.com/${tenantId}/v2.0`,
      clientIdSettingName: 'GAME_HUB_EXTERNAL_ID_CLIENT_ID',
      clientSecretCertificateKeyVaultReference:
        '@Microsoft.KeyVault(SecretUri=https://gamehub-dev.vault.azure.net/certificates/external-id)',
      clientSecretCertificateThumbprint: '*',
    });
    expect(JSON.stringify(rendered)).not.toContain('clientSecretSettingName');
  });
});

class FakeGraph {
  constructor(responses) {
    this.responses = responses;
    this.calls = [];
  }

  async request(path, { body, method = 'GET' } = {}) {
    this.calls.push({ body, method, path });
    if (this.responses.length === 0) {
      throw new Error(`Unexpected Microsoft Graph request: ${method} ${path}`);
    }
    return this.responses.shift();
  }
}
