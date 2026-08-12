import { AUTHENTICATION_CONFIGURATION } from './contract';

const fallbackReturnPath = '/';
const returnPathParameter = 'returnTo';
const signInRedirectParameter = 'post_login_redirect_uri';
const signOutRedirectParameter = 'post_logout_redirect_uri';

interface WebsiteLocation {
  hash: string;
  origin: string;
  pathname: string;
  search: string;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function decodeForValidation(value: string): string | undefined {
  let decodedValue = value;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const nextValue = decodeURIComponent(decodedValue);

      if (nextValue === decodedValue) {
        return decodedValue;
      }

      decodedValue = nextValue;
    }

    return decodeURIComponent(decodedValue) === decodedValue ? decodedValue : undefined;
  } catch {
    return undefined;
  }
}

function isServicePath(pathname: string): boolean {
  const normalizedPath = pathname.toLowerCase();

  return (
    normalizedPath === '/.auth' ||
    normalizedPath.startsWith('/.auth/') ||
    normalizedPath === '/api' ||
    normalizedPath.startsWith('/api/')
  );
}

export function validateWebsiteReturnPath(
  candidate: string | null | undefined,
  origin = window.location.origin,
): string {
  const decodedCandidate = candidate ? decodeForValidation(candidate) : undefined;

  if (
    !candidate ||
    !decodedCandidate ||
    !candidate.startsWith('/') ||
    decodedCandidate.startsWith('//') ||
    decodedCandidate.includes('\\') ||
    hasControlCharacter(decodedCandidate)
  ) {
    return fallbackReturnPath;
  }

  try {
    const trustedOrigin = new URL(origin).origin;
    const target = new URL(candidate, trustedOrigin);
    const decodedPathname = decodeForValidation(target.pathname);

    if (!decodedPathname || target.origin !== trustedOrigin || isServicePath(decodedPathname)) {
      return fallbackReturnPath;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallbackReturnPath;
  }
}

export function getCurrentWebsiteReturnPath(location: WebsiteLocation = window.location): string {
  const currentPath = validateWebsiteReturnPath(
    `${location.pathname}${location.search}${location.hash}`,
    location.origin,
  );
  const normalizedPathname = location.pathname.replace(/\/+$/, '') || '/';

  if (normalizedPathname !== AUTHENTICATION_CONFIGURATION.accountPath) {
    return currentPath;
  }

  return validateWebsiteReturnPath(new URLSearchParams(location.search).get(returnPathParameter), location.origin);
}

function createAuthRedirectPath(basePath: string, parameter: string, returnPath: string, origin?: string): string {
  const safeReturnPath = validateWebsiteReturnPath(returnPath, origin);

  return `${basePath}?${parameter}=${encodeURIComponent(safeReturnPath)}`;
}

export function createAccountPath(returnPath: string, origin?: string): string {
  const safeReturnPath = validateWebsiteReturnPath(returnPath, origin);

  if (safeReturnPath === fallbackReturnPath) {
    return AUTHENTICATION_CONFIGURATION.accountPath;
  }

  return `${AUTHENTICATION_CONFIGURATION.accountPath}?${returnPathParameter}=${encodeURIComponent(safeReturnPath)}`;
}

export function createSignInPath(returnPath: string, origin?: string): string {
  return createAuthRedirectPath(AUTHENTICATION_CONFIGURATION.signInPath, signInRedirectParameter, returnPath, origin);
}

export function createSignOutPath(returnPath: string, origin?: string): string {
  return createAuthRedirectPath(AUTHENTICATION_CONFIGURATION.signOutPath, signOutRedirectParameter, returnPath, origin);
}
