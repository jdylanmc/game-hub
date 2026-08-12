import { describe, expect, it, vi } from 'vitest';
import { AUTHENTICATION_CONFIGURATION } from './contract';
import { loadAuthSession } from './session';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const authenticatedPlatformSession = {
  clientPrincipal: {
    identityProvider: 'aad',
    userId: 'platform-user',
    userRoles: ['authenticated'],
  },
};

describe('loadAuthSession', () => {
  it('keeps visitors anonymous without calling the protected application endpoint', async () => {
    const sessionFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ clientPrincipal: null }));

    await expect(loadAuthSession(sessionFetch)).resolves.toEqual({
      state: 'anonymous',
    });
    expect(sessionFetch).toHaveBeenCalledOnce();
    expect(sessionFetch).toHaveBeenCalledWith(AUTHENTICATION_CONFIGURATION.platformSessionPath, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  });

  it('resolves an authenticated platform session to the internal Game Hub identity', async () => {
    const sessionFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authenticatedPlatformSession))
      .mockResolvedValueOnce(
        jsonResponse({
          state: 'authenticated',
          userId: 'game-hub-user',
        }),
      );

    await expect(loadAuthSession(sessionFetch)).resolves.toEqual({
      state: 'authenticated',
      userId: 'game-hub-user',
    });
    expect(sessionFetch).toHaveBeenNthCalledWith(2, AUTHENTICATION_CONFIGURATION.applicationSessionPath, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  });

  it.each([
    { applicationSession: { state: 'anonymous' }, name: 'anonymous API state' },
    {
      applicationSession: { state: 'authenticated', userId: '' },
      name: 'empty internal user ID',
    },
    {
      applicationSession: { state: 'authenticated', userId: 42 },
      name: 'non-string internal user ID',
    },
    { applicationSession: { state: 'unexpected' }, name: 'unknown state' },
    { applicationSession: null, name: 'non-object response' },
  ])('fails safely to anonymous for $name', async ({ applicationSession }) => {
    const sessionFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authenticatedPlatformSession))
      .mockResolvedValueOnce(jsonResponse(applicationSession));

    await expect(loadAuthSession(sessionFetch)).resolves.toEqual({
      state: 'anonymous',
    });
  });

  it('fails safely when either session endpoint is unavailable or malformed', async () => {
    const unavailableFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('{', { status: 200 }));
    const rejectedFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('network unavailable'));

    await expect(loadAuthSession(unavailableFetch)).resolves.toEqual({
      state: 'anonymous',
    });
    await expect(loadAuthSession(malformedFetch)).resolves.toEqual({
      state: 'anonymous',
    });
    await expect(loadAuthSession(rejectedFetch)).resolves.toEqual({
      state: 'anonymous',
    });
  });
});
