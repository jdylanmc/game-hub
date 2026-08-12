import { AUTHENTICATION_CONFIGURATION, type AnonymousAuthSession, type AuthSession } from '@game-hub/auth-contract';
import type { ApiConfiguration } from './config.js';
import type { UserIdentityStore } from './identity-store.js';
import { parseTrustedPlatformIdentity, PlatformPrincipalValidationError } from './platform-principal.js';

const ANONYMOUS_SESSION: AnonymousAuthSession = { state: 'anonymous' };

export interface ApiRequest {
  headers: Readonly<Record<string, string | undefined>>;
  method: string;
  pathname: string;
}

export interface ApiResponse {
  body: AuthSession | { error: 'method_not_allowed' | 'not_found' };
  headers: Readonly<Record<string, string>>;
  status: 200 | 401 | 404 | 405 | 503;
}

export async function handleApiRequest(
  request: ApiRequest,
  configuration: ApiConfiguration,
  identityStore: UserIdentityStore,
): Promise<ApiResponse> {
  if (request.pathname !== AUTHENTICATION_CONFIGURATION.applicationSessionPath) {
    return errorResponse(404, 'not_found');
  }

  if (request.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed', { Allow: 'GET' });
  }

  const encodedPrincipal = request.headers[configuration.authentication.principalHeader];
  if (!encodedPrincipal) {
    return sessionResponse(401, ANONYMOUS_SESSION);
  }

  try {
    const identity = parseTrustedPlatformIdentity(encodedPrincipal, configuration.authentication);
    const userId = await identityStore.getOrCreate(identity);
    return sessionResponse(200, { state: 'authenticated', userId });
  } catch (error) {
    if (error instanceof PlatformPrincipalValidationError) {
      return sessionResponse(401, ANONYMOUS_SESSION);
    }

    throw error;
  }
}

function sessionResponse(status: 200 | 401, body: AuthSession): ApiResponse {
  return {
    body,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      Vary: 'x-ms-client-principal',
    },
    status,
  };
}

function errorResponse(
  status: 404 | 405,
  error: 'method_not_allowed' | 'not_found',
  additionalHeaders: Readonly<Record<string, string>> = {},
): ApiResponse {
  return {
    body: { error },
    headers: {
      ...additionalHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  };
}
