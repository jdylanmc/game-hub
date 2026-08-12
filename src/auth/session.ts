import {
  AUTHENTICATION_CONFIGURATION,
  type ApplicationSessionResponse,
  type AuthSession,
  type AuthenticationSessionFailure,
  type GameHubUserId,
} from './contract';

const anonymousSession: AuthSession = { state: 'anonymous' };
const sessionResolutionFailure: AuthenticationSessionFailure = {
  error: 'session_resolution_failed',
  state: 'error',
};

export type WebsiteAuthSessionResult = AuthSession | AuthenticationSessionFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePlatformSession(value: unknown): 'anonymous' | 'authenticated' | 'invalid' {
  if (!isRecord(value) || !('clientPrincipal' in value)) {
    return 'invalid';
  }

  if (value.clientPrincipal === null) {
    return 'anonymous';
  }

  return isRecord(value.clientPrincipal) ? 'authenticated' : 'invalid';
}

function parseApplicationSession(value: unknown): ApplicationSessionResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
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

  if (
    value.state === 'error' &&
    (value.error === 'identity_resolution_conflict' || value.error === 'session_resolution_failed')
  ) {
    return {
      error: value.error,
      state: 'error',
    };
  }

  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function loadAuthSession(sessionFetch: typeof fetch = fetch): Promise<WebsiteAuthSessionResult> {
  try {
    const platformResponse = await sessionFetch(AUTHENTICATION_CONFIGURATION.platformSessionPath, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!platformResponse.ok) {
      return sessionResolutionFailure;
    }

    const platformSession = await readJson(platformResponse);
    const platformState = parsePlatformSession(platformSession);

    if (platformState === 'anonymous') {
      return anonymousSession;
    }

    if (platformState === 'invalid') {
      return sessionResolutionFailure;
    }

    const applicationResponse = await sessionFetch(AUTHENTICATION_CONFIGURATION.applicationSessionPath, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const applicationSession = parseApplicationSession(await readJson(applicationResponse));

    if (applicationResponse.ok && applicationSession?.state === 'authenticated') {
      return applicationSession;
    }

    if (
      applicationSession?.state === 'error' &&
      ((applicationResponse.status === 409 && applicationSession.error === 'identity_resolution_conflict') ||
        (applicationResponse.status === 503 && applicationSession.error === 'session_resolution_failed'))
    ) {
      return applicationSession;
    }

    return sessionResolutionFailure;
  } catch {
    return sessionResolutionFailure;
  }
}
