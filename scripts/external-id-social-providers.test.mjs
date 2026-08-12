import { describe, expect, it } from 'vitest';
import {
  buildExternalIdSocialProviderState,
  loadExternalIdSocialProviderConfiguration,
  reconcileExternalIdSocialProviders,
  resolveExternalIdSocialProviderReferences,
  validateExternalIdSocialProviderConfiguration,
} from './external-id-social-providers.mjs';

const configuration = loadExternalIdSocialProviderConfiguration();
const environmentVariables = {
  GAME_HUB_FACEBOOK_CLIENT_ID: 'facebook-app-id',
  GAME_HUB_FACEBOOK_CLIENT_SECRET: 'facebook-provider-credential',
  GAME_HUB_GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  GAME_HUB_GOOGLE_CLIENT_SECRET: 'google-provider-credential',
};
const userFlowDisplayName = 'Game Hub dev sign-up and sign-in';

describe('External ID social-provider configuration', () => {
  it('stores only non-secret provider and Azure Key Vault references', () => {
    expect(validateExternalIdSocialProviderConfiguration(configuration)).toEqual([]);
    expect(resolveExternalIdSocialProviderReferences(configuration, { environment: 'dev' })).toEqual({
      keyVaultName: 'kv-gamehub-dev-eus2',
      providers: [
        {
          clientIdEnvironmentVariable: 'GAME_HUB_GOOGLE_CLIENT_ID',
          clientSecretEnvironmentVariable: 'GAME_HUB_GOOGLE_CLIENT_SECRET',
          clientSecretKeyVaultSecretName: 'external-id-google-client-secret',
          identityProviderType: 'Google',
        },
        {
          clientIdEnvironmentVariable: 'GAME_HUB_FACEBOOK_CLIENT_ID',
          clientSecretEnvironmentVariable: 'GAME_HUB_FACEBOOK_CLIENT_SECRET',
          clientSecretKeyVaultSecretName: 'external-id-facebook-client-secret',
          identityProviderType: 'Facebook',
        },
      ],
    });
    expect(JSON.stringify(configuration)).not.toContain('google-provider-credential');
    expect(JSON.stringify(configuration)).not.toContain('facebook-provider-credential');
  });

  it('creates Google and Facebook providers and attaches both to the shared user flow', async () => {
    const desired = buildExternalIdSocialProviderState(configuration, {
      environment: 'dev',
      environmentVariables,
      userFlowDisplayName,
    });
    const graph = new FakeGraph([
      { value: [{ id: 'EmailPassword-OAUTH', identityProviderType: 'EmailPassword' }] },
      { id: 'Google-OAUTH' },
      { id: 'Facebook-OAUTH' },
      {
        displayName: userFlowDisplayName,
        id: 'flow-id',
        onAuthenticationMethodLoadStart: {
          identityProviders: [{ id: 'EmailPassword-OAUTH' }],
        },
      },
      null,
    ]);

    const result = await reconcileExternalIdSocialProviders(graph, desired, { userFlowId: 'flow-id' });

    expect(result).toEqual({
      changes: ['created-google-provider', 'created-facebook-provider', 'updated-user-flow-providers'],
      providers: [
        { id: 'Google-OAUTH', identityProviderType: 'Google' },
        { id: 'Facebook-OAUTH', identityProviderType: 'Facebook' },
      ],
      userFlowDisplayName,
      userFlowId: 'flow-id',
    });
    expect(graph.calls.filter((call) => call.method === 'POST')).toEqual([
      expect.objectContaining({
        body: expect.objectContaining({
          clientId: environmentVariables.GAME_HUB_GOOGLE_CLIENT_ID,
          clientSecret: environmentVariables.GAME_HUB_GOOGLE_CLIENT_SECRET,
          identityProviderType: 'Google',
        }),
        path: '/identity/identityProviders',
      }),
      expect.objectContaining({
        body: expect.objectContaining({
          clientId: environmentVariables.GAME_HUB_FACEBOOK_CLIENT_ID,
          clientSecret: environmentVariables.GAME_HUB_FACEBOOK_CLIENT_SECRET,
          identityProviderType: 'Facebook',
        }),
        path: '/identity/identityProviders',
      }),
    ]);
    expect(graph.calls.at(-1)).toMatchObject({
      body: {
        onAuthenticationMethodLoadStart: {
          identityProviders: [{ id: 'EmailPassword-OAUTH' }, { id: 'Google-OAUTH' }, { id: 'Facebook-OAUTH' }],
        },
      },
      method: 'PATCH',
      path: '/identity/authenticationEventsFlows/flow-id',
    });
    expect(JSON.stringify(result)).not.toContain(environmentVariables.GAME_HUB_GOOGLE_CLIENT_SECRET);
    expect(JSON.stringify(result)).not.toContain(environmentVariables.GAME_HUB_FACEBOOK_CLIENT_SECRET);
  });

  it('synchronizes rotated credentials without duplicating providers or user-flow entries', async () => {
    const desired = buildExternalIdSocialProviderState(configuration, {
      environment: 'dev',
      environmentVariables,
      userFlowDisplayName,
    });
    const graph = new FakeGraph([
      {
        value: [
          { id: 'Google-OAUTH', identityProviderType: 'Google' },
          { id: 'Facebook-OAUTH', identityProviderType: 'Facebook' },
        ],
      },
      null,
      null,
      {
        displayName: userFlowDisplayName,
        id: 'flow-id',
        onAuthenticationMethodLoadStart: {
          identityProviders: [{ id: 'EmailPassword-OAUTH' }, { id: 'Google-OAUTH' }, { id: 'Facebook-OAUTH' }],
        },
      },
    ]);

    const result = await reconcileExternalIdSocialProviders(graph, desired, { userFlowId: 'flow-id' });

    expect(result.changes).toEqual(['synchronized-google-provider', 'synchronized-facebook-provider']);
    expect(graph.calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
    expect(graph.calls.some((call) => call.path === '/identity/authenticationEventsFlows/flow-id')).toBe(false);
  });

  it('rejects committed provider credential values', () => {
    const invalid = structuredClone(configuration);
    invalid.providers[0].clientSecret = 'must-not-be-committed';

    expect(validateExternalIdSocialProviderConfiguration(invalid)).toContain(
      'External ID social-provider configuration contains forbidden credential field: clientSecret.',
    );
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
