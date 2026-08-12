import type { PlatformIdentityReference } from '@game-hub/auth-contract';
import type { ApiConfiguration } from './config.js';

const MAX_PRINCIPAL_HEADER_LENGTH = 24_576;
const MAX_PLATFORM_SUBJECT_LENGTH = 512;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

interface StaticWebAppsClientPrincipal {
  identityProvider?: unknown;
  userId?: unknown;
  userRoles?: unknown;
}

export class PlatformPrincipalValidationError extends Error {
  constructor() {
    super('The platform principal is invalid.');
    this.name = 'PlatformPrincipalValidationError';
  }
}

export function parseTrustedPlatformIdentity(
  encodedPrincipal: string,
  authentication: ApiConfiguration['authentication'],
): PlatformIdentityReference {
  if (
    encodedPrincipal.length === 0 ||
    encodedPrincipal.length > MAX_PRINCIPAL_HEADER_LENGTH ||
    !BASE64_PATTERN.test(encodedPrincipal)
  ) {
    throw new PlatformPrincipalValidationError();
  }

  let principal: StaticWebAppsClientPrincipal;
  try {
    const json = Buffer.from(encodedPrincipal, 'base64').toString('utf8');
    principal = JSON.parse(json) as StaticWebAppsClientPrincipal;
  } catch {
    throw new PlatformPrincipalValidationError();
  }

  if (
    !principal ||
    typeof principal !== 'object' ||
    principal.identityProvider !== authentication.provider ||
    typeof principal.userId !== 'string' ||
    principal.userId.length === 0 ||
    principal.userId.length > MAX_PLATFORM_SUBJECT_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(principal.userId) ||
    !Array.isArray(principal.userRoles) ||
    !principal.userRoles.every((role) => typeof role === 'string') ||
    !principal.userRoles.includes(authentication.requiredRole)
  ) {
    throw new PlatformPrincipalValidationError();
  }

  return {
    provider: authentication.provider,
    subject: principal.userId,
  };
}
