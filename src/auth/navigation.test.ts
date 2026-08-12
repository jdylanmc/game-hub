import { describe, expect, it } from 'vitest';
import {
  createAccountPath,
  createAuthenticationCompletionPath,
  createSignInPath,
  createSignOutPath,
  getCurrentWebsiteReturnPath,
  isAuthenticationCompletion,
  validateWebsiteReturnPath,
} from './navigation';

const origin = 'https://game-hub.example';

describe('authentication navigation', () => {
  it('preserves same-origin website paths including query and fragment state', () => {
    const returnPath = '/games/neon-drift?mode=daily#score';

    expect(validateWebsiteReturnPath(returnPath, origin)).toBe(returnPath);
    expect(createAccountPath(returnPath, origin)).toBe(
      '/account?returnTo=%2Fgames%2Fneon-drift%3Fmode%3Ddaily%23score',
    );
    expect(createAuthenticationCompletionPath(returnPath, origin)).toBe(
      '/account?authentication=complete&returnTo=%2Fgames%2Fneon-drift%3Fmode%3Ddaily%23score',
    );
    expect(createSignInPath(returnPath, origin)).toBe(
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252Fgames%252Fneon-drift%253Fmode%253Ddaily%2523score',
    );
    expect(createSignOutPath(returnPath, origin)).toBe(
      '/.auth/logout?post_logout_redirect_uri=%2Fgames%2Fneon-drift%3Fmode%3Ddaily%23score',
    );
  });

  it.each([
    ['absolute external URL', 'https://attacker.example/phish'],
    ['protocol-relative URL', '//attacker.example/phish'],
    ['backslash authority URL', '/\\attacker.example/phish'],
    ['encoded authority URL', '/%252f%252fattacker.example/phish'],
    ['encoded backslash URL', '/%255c%255cattacker.example/phish'],
    ['script URL', 'javascript:alert(1)'],
    ['authentication service path', '/.auth/login/aad'],
    ['encoded authentication service path', '/%252eauth/login/aad'],
    ['application programming interface path', '/api/auth/session'],
    ['control-character path', '/games/neon-drift\n//attacker.example'],
  ])('replaces an unsafe %s with the website root', (_name, candidate) => {
    expect(validateWebsiteReturnPath(candidate, origin)).toBe('/');
    expect(createSignInPath(candidate, origin)).toBe(
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252F',
    );
    expect(createSignOutPath(candidate, origin)).toBe('/.auth/logout?post_logout_redirect_uri=%2F');
  });

  it('uses a validated account return parameter instead of recursively returning to the account page', () => {
    expect(
      getCurrentWebsiteReturnPath({
        hash: '',
        origin,
        pathname: '/account',
        search: '?returnTo=%2Fgames%2Forbital-stack%3Fmode%3Dendless%23results',
      }),
    ).toBe('/games/orbital-stack?mode=endless#results');
  });

  it('falls back to the root when an account return parameter is missing or untrusted', () => {
    expect(
      getCurrentWebsiteReturnPath({
        hash: '',
        origin,
        pathname: '/account',
        search: '?returnTo=https%3A%2F%2Fattacker.example%2Fphish',
      }),
    ).toBe('/');
    expect(
      getCurrentWebsiteReturnPath({
        hash: '',
        origin,
        pathname: '/account',
        search: '',
      }),
    ).toBe('/');
  });

  it('recognizes only the account completion marker', () => {
    expect(
      isAuthenticationCompletion({
        pathname: '/account',
        search: '?authentication=complete&returnTo=%2Fgames%2Ffloppy-bird',
      }),
    ).toBe(true);
    expect(
      isAuthenticationCompletion({
        pathname: '/account',
        search: '?authentication=failed',
      }),
    ).toBe(false);
    expect(
      isAuthenticationCompletion({
        pathname: '/games/floppy-bird',
        search: '?authentication=complete',
      }),
    ).toBe(false);
  });
});
