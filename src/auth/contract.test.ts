import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATION_CONFIGURATION,
  AUTHENTICATION_METHODS,
  type AuthSession,
  type PlatformIdentityReference,
} from './contract';

describe('authentication contract', () => {
  it('keeps the issue-required credential methods behind one External ID provider', () => {
    expect(AUTHENTICATION_METHODS).toEqual(['local', 'google', 'facebook']);
    expect(AUTHENTICATION_CONFIGURATION.providerName).toBe('aad');
  });

  it('exposes only same-origin browser paths', () => {
    const paths = [
      AUTHENTICATION_CONFIGURATION.applicationSessionPath,
      AUTHENTICATION_CONFIGURATION.accountPath,
      AUTHENTICATION_CONFIGURATION.platformSessionPath,
      AUTHENTICATION_CONFIGURATION.signInPath,
      AUTHENTICATION_CONFIGURATION.signOutPath,
    ];

    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
    expect(paths.every((path) => !path.startsWith('//'))).toBe(true);
  });

  it('keeps local credential processing inside Microsoft Entra External ID', () => {
    expect(AUTHENTICATION_CONFIGURATION.localAccount).toEqual({
      credentialCollection: 'microsoft-entra-external-id',
      emailVerification: 'email-one-time-passcode',
      passwordReset: 'self-service-email-one-time-passcode',
    });
  });

  it('separates the platform subject from the internal session identity', () => {
    const platformIdentity: PlatformIdentityReference = {
      provider: 'aad',
      subject: 'platform-subject',
    };
    const session: AuthSession = { state: 'anonymous' };

    expect(platformIdentity.subject).toBe('platform-subject');
    expect(session).toEqual({ state: 'anonymous' });
  });
});
