import { describe, expect, it } from 'vitest';
import {
  loadAuthenticationAbuseProtectionConfiguration,
  validateAuthenticationAbuseProtectionConfiguration,
} from './authentication-abuse-protection.mjs';

const configuration = loadAuthenticationAbuseProtectionConfiguration();

describe('authentication abuse protection configuration', () => {
  it('layers environment-aware edge controls with Microsoft-managed identity protections', () => {
    expect(validateAuthenticationAbuseProtectionConfiguration(configuration)).toEqual([]);
    expect(configuration.edge.environments).toEqual({
      dev: {
        durationInMinutes: 5,
        mode: 'Detection',
        thresholdPerSocketIp: 1000,
      },
      prod: {
        durationInMinutes: 5,
        mode: 'Prevention',
        thresholdPerSocketIp: 500,
      },
    });
    expect(configuration.identityService).toMatchObject({
      authenticationSurface: 'browser-delegated',
      browserConfigurationContainsSensitiveValues: false,
      commonNetworkingHttpProtection: 'enabled-by-default',
      gameHubReceivesPlaintextPasswords: false,
      gameHubStoresPlaintextPasswords: false,
      smartLockout: 'enabled-by-default',
    });
  });

  it('rejects weakened production authentication controls', () => {
    const invalid = structuredClone(configuration);
    invalid.edge.environments.prod.mode = 'Detection';
    invalid.edge.environments.prod.thresholdPerSocketIp = invalid.edge.environments.dev.thresholdPerSocketIp;

    expect(validateAuthenticationAbuseProtectionConfiguration(invalid)).toEqual(
      expect.arrayContaining([
        'Production authentication protection must use prevention mode.',
        'Production authentication rate limiting must be stricter than development.',
      ]),
    );
  });

  it('rejects sensitive values in the reviewed configuration', () => {
    const invalid = structuredClone(configuration);
    invalid.identityService.sessionToken = 'must-not-be-committed';

    expect(validateAuthenticationAbuseProtectionConfiguration(invalid)).toContain(
      'Authentication abuse protection contains forbidden sensitive field: sessionToken.',
    );
  });
});
