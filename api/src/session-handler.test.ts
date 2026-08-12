import type { GameHubUserId } from '@game-hub/auth-contract';
import { describe, expect, it, vi } from 'vitest';
import type { ApiConfiguration } from './config.js';
import { IdentityResolutionConflictError } from './identity-store.js';
import { handleApiRequest } from './session-handler.js';

const configuration: ApiConfiguration = {
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
};

function request(encodedPrincipal?: string) {
  return {
    headers: {
      'x-ms-client-principal': encodedPrincipal,
    },
    method: 'GET',
    pathname: '/api/auth/session',
  };
}

function encodePrincipal(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      identityProvider: 'aad',
      userDetails: 'person@example.com',
      userId: 'platform-subject',
      userRoles: ['anonymous', 'authenticated'],
      ...overrides,
    }),
    'utf8',
  ).toString('base64');
}

describe('application session endpoint', () => {
  it('returns the shared anonymous contract without resolving an identity', async () => {
    const getOrCreate = vi.fn();

    await expect(handleApiRequest(request(), configuration, { getOrCreate })).resolves.toMatchObject({
      body: { state: 'anonymous' },
      status: 401,
    });
    expect(getOrCreate).not.toHaveBeenCalled();
  });

  it('resolves and returns only the internal Game Hub user ID', async () => {
    const userId = 'usr_11111111-2222-4333-8444-555555555555' as GameHubUserId;
    const getOrCreate = vi.fn().mockResolvedValue(userId);

    const response = await handleApiRequest(request(encodePrincipal()), configuration, {
      getOrCreate,
    });

    expect(response).toMatchObject({
      body: { state: 'authenticated', userId },
      headers: {
        'Cache-Control': 'no-store',
        Vary: 'x-ms-client-principal',
      },
      status: 200,
    });
    expect(JSON.stringify(response.body)).not.toContain('person@example.com');
    expect(getOrCreate).toHaveBeenCalledWith({
      provider: 'aad',
      subject: 'platform-subject',
    });
  });

  it('fails closed for an untrusted provider', async () => {
    const getOrCreate = vi.fn();

    await expect(
      handleApiRequest(request(encodePrincipal({ identityProvider: 'facebook' })), configuration, { getOrCreate }),
    ).resolves.toMatchObject({
      body: { state: 'anonymous' },
      status: 401,
    });
    expect(getOrCreate).not.toHaveBeenCalled();
  });

  it('returns a typed conflict without provider details when identity resolution is ambiguous', async () => {
    const getOrCreate = vi.fn().mockRejectedValue(new IdentityResolutionConflictError());

    await expect(handleApiRequest(request(encodePrincipal()), configuration, { getOrCreate })).resolves.toMatchObject({
      body: {
        error: 'identity_resolution_conflict',
        state: 'error',
      },
      status: 409,
    });
  });

  it('never merges matching email details from distinct platform subjects', async () => {
    const getOrCreate = vi
      .fn()
      .mockResolvedValueOnce('usr_11111111-2222-4333-8444-555555555555')
      .mockResolvedValueOnce('usr_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

    await handleApiRequest(request(encodePrincipal({ userId: 'first-subject' })), configuration, { getOrCreate });
    await handleApiRequest(request(encodePrincipal({ userId: 'second-subject' })), configuration, { getOrCreate });

    expect(getOrCreate).toHaveBeenNthCalledWith(1, {
      provider: 'aad',
      subject: 'first-subject',
    });
    expect(getOrCreate).toHaveBeenNthCalledWith(2, {
      provider: 'aad',
      subject: 'second-subject',
    });
  });

  it.each([
    ['POST', '/api/auth/session', 405],
    ['GET', '/api/other', 404],
  ])('rejects %s %s', async (method, pathname, status) => {
    await expect(
      handleApiRequest({ headers: {}, method, pathname }, configuration, { getOrCreate: vi.fn() }),
    ).resolves.toMatchObject({ status });
  });
});
