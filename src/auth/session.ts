import { AUTHENTICATION_CONFIGURATION, type AuthSession, type GameHubUserId } from './contract';

const anonymousSession: AuthSession = { state: 'anonymous' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasPlatformSession(value: unknown): boolean {
  return isRecord(value) && isRecord(value.clientPrincipal);
}

function parseApplicationSession(value: unknown): AuthSession {
  if (!isRecord(value)) {
    return anonymousSession;
  }

  if (value.state === 'anonymous') {
    return anonymousSession;
  }

  if (value.state === 'authenticated' && typeof value.userId === 'string' && value.userId.length > 0) {
    return {
      state: 'authenticated',
      userId: value.userId as GameHubUserId,
    };
  }

  return anonymousSession;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function loadAuthSession(sessionFetch: typeof fetch = fetch): Promise<AuthSession> {
  try {
    const platformResponse = await sessionFetch(AUTHENTICATION_CONFIGURATION.platformSessionPath, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const platformSession = await readJson(platformResponse);

    if (!hasPlatformSession(platformSession)) {
      return anonymousSession;
    }

    const applicationResponse = await sessionFetch(AUTHENTICATION_CONFIGURATION.applicationSessionPath, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    return parseApplicationSession(await readJson(applicationResponse));
  } catch {
    return anonymousSession;
  }
}
