import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { GameHubUserId } from '@game-hub/auth-contract';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiConfiguration } from './config.js';
import { createGameHubApiServer } from './server.js';

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

const servers = new Set<ReturnType<typeof createGameHubApiServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            servers.delete(server);
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

describe('Game Hub API server', () => {
  it('serves the typed authenticated session over HTTP', async () => {
    const userId = 'usr_11111111-2222-4333-8444-555555555555' as GameHubUserId;
    const server = createGameHubApiServer(configuration, {
      getOrCreate: () => Promise.resolve(userId),
    });
    servers.add(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address() as AddressInfo;
    const principal = Buffer.from(
      JSON.stringify({
        identityProvider: 'aad',
        userId: 'platform-subject',
        userRoles: ['authenticated'],
      }),
      'utf8',
    ).toString('base64');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/session`, {
      headers: { 'x-ms-client-principal': principal },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: 'authenticated', userId });
  });

  it('returns a typed recoverable failure when identity storage is unavailable', async () => {
    const server = createGameHubApiServer(configuration, {
      getOrCreate: () => Promise.reject(new Error('storage unavailable')),
    });
    servers.add(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address() as AddressInfo;
    const principal = Buffer.from(
      JSON.stringify({
        identityProvider: 'aad',
        userId: 'platform-subject',
        userRoles: ['authenticated'],
      }),
      'utf8',
    ).toString('base64');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/session`, {
      headers: { 'x-ms-client-principal': principal },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'session_resolution_failed',
      state: 'error',
    });
  });
});
