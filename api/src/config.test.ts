import { describe, expect, it } from 'vitest';
import { loadApiConfiguration } from './config.js';

const validEnvironment = {
  AZURE_CLIENT_ID: '11111111-2222-4333-8444-555555555555',
  GAME_HUB_AUTH_PRINCIPAL_HEADER: 'x-ms-client-principal',
  GAME_HUB_AUTH_PROVIDER: 'aad',
  GAME_HUB_AUTH_REQUIRED_ROLE: 'authenticated',
  GAME_HUB_IDENTITY_STORAGE_ENDPOINT: 'https://stgamehub.table.core.windows.net/',
  GAME_HUB_IDENTITY_TABLE_NAME: 'useridentities',
  PORT: '8080',
};

describe('API configuration', () => {
  it('loads only the typed non-secret runtime settings', () => {
    expect(loadApiConfiguration(validEnvironment)).toEqual({
      authentication: {
        principalHeader: 'x-ms-client-principal',
        provider: 'aad',
        requiredRole: 'authenticated',
      },
      identityStorage: {
        endpoint: 'https://stgamehub.table.core.windows.net/',
        managedIdentityClientId: '11111111-2222-4333-8444-555555555555',
        tableName: 'useridentities',
      },
      port: 8080,
    });
  });

  it.each([
    ['wrong provider', { GAME_HUB_AUTH_PROVIDER: 'google' }],
    ['untrusted principal header', { GAME_HUB_AUTH_PRINCIPAL_HEADER: 'authorization' }],
    ['non-Azure table endpoint', { GAME_HUB_IDENTITY_STORAGE_ENDPOINT: 'https://example.com/' }],
    ['endpoint credentials', { GAME_HUB_IDENTITY_STORAGE_ENDPOINT: 'https://user:pass@st.table.core.windows.net/' }],
    ['invalid table name', { GAME_HUB_IDENTITY_TABLE_NAME: '../users' }],
    ['invalid managed identity', { AZURE_CLIENT_ID: 'not-an-identity' }],
    ['invalid port', { PORT: '0' }],
  ])('rejects %s', (_label, override) => {
    expect(() => loadApiConfiguration({ ...validEnvironment, ...override })).toThrow();
  });
});
