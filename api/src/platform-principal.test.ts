import { describe, expect, it } from 'vitest';
import type { ApiConfiguration } from './config.js';
import { parseTrustedPlatformIdentity, PlatformPrincipalValidationError } from './platform-principal.js';

const authentication: ApiConfiguration['authentication'] = {
  principalHeader: 'x-ms-client-principal',
  provider: 'aad',
  requiredRole: 'authenticated',
};

function encodePrincipal(principal: unknown): string {
  return Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');
}

describe('Static Web Apps platform principal', () => {
  it('returns only the provider and stable platform subject', () => {
    const encoded = encodePrincipal({
      claims: [{ typ: 'access_token', val: 'must-not-escape' }],
      identityProvider: 'aad',
      userDetails: 'person@example.com',
      userId: 'stable-platform-subject',
      userRoles: ['anonymous', 'authenticated'],
    });

    expect(parseTrustedPlatformIdentity(encoded, authentication)).toEqual({
      provider: 'aad',
      subject: 'stable-platform-subject',
    });
  });

  it.each([
    ['malformed Base64', 'not base64'],
    ['malformed JSON', Buffer.from('{', 'utf8').toString('base64')],
    [
      'wrong provider',
      encodePrincipal({
        identityProvider: 'google',
        userId: 'subject',
        userRoles: ['authenticated'],
      }),
    ],
    [
      'missing authenticated role',
      encodePrincipal({
        identityProvider: 'aad',
        userId: 'subject',
        userRoles: ['anonymous'],
      }),
    ],
    [
      'empty subject',
      encodePrincipal({
        identityProvider: 'aad',
        userId: '',
        userRoles: ['authenticated'],
      }),
    ],
  ])('rejects a principal with %s', (_label, encoded) => {
    expect(() => parseTrustedPlatformIdentity(encoded, authentication)).toThrow(PlatformPrincipalValidationError);
  });
});
