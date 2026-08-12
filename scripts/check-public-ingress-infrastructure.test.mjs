import { describe, expect, it } from 'vitest';
import {
  loadPublicIngressInfrastructure,
  validatePublicIngressInfrastructure,
} from './check-public-ingress-infrastructure.mjs';

const infrastructure = loadPublicIngressInfrastructure();

function violations(overrides = {}) {
  return validatePublicIngressInfrastructure({
    ...infrastructure,
    ...overrides,
  });
}

describe('public ingress infrastructure policy', () => {
  it('accepts the protected Front Door, managed rules, and rate-limit boundary', () => {
    expect(violations()).toEqual([]);
  });

  it.each([
    [
      'managed bot protection',
      {
        publicIngressModule: infrastructure.publicIngressModule.replace(
          'ruleSetType: botManagerRuleSetType',
          "ruleSetType: 'RemovedBotProtection'",
        ),
      },
    ],
    [
      'API rate limit',
      {
        publicIngressModule: infrastructure.publicIngressModule.replace("name: 'ApiRateLimit'", "name: 'Removed'"),
      },
    ],
    [
      'account entry rate limit',
      {
        publicIngressModule: infrastructure.publicIngressModule.replace("                '/account'\n", ''),
      },
    ],
    [
      'all-path web application firewall association',
      {
        publicIngressModule: infrastructure.publicIngressModule.replace(
          "webApplicationFirewallAssociationPattern = '/*'",
          "webApplicationFirewallAssociationPattern = '/frontend-only/*'",
        ),
      },
    ],
    [
      'production prevention mode',
      {
        environmentParameters: {
          ...infrastructure.environmentParameters,
          prod: infrastructure.environmentParameters.prod.replace(
            "param webApplicationFirewallMode = 'Prevention'",
            "param webApplicationFirewallMode = 'Detection'",
          ),
        },
      },
    ],
    [
      'canonical authentication hostname',
      {
        authenticationModule: infrastructure.authenticationModule.replace(
          "var frontendEndpoint = 'https://${publicIngressHostName}'",
          "var frontendEndpoint = 'https://${staticWebAppHostName}'",
        ),
      },
    ],
  ])('rejects removal of the %s', (_label, overrides) => {
    expect(violations(overrides)).not.toEqual([]);
  });

  it('rejects a credential field in the ingress contract', () => {
    expect(
      violations({
        publicIngressModule: `${infrastructure.publicIngressModule}\nparam connectionString string`,
      }),
    ).toContain('Public ingress infrastructure contains forbidden credential field: connectionString.');
  });

  it('rejects drift from the reviewed environment-aware authentication threshold', () => {
    expect(
      violations({
        environmentParameters: {
          ...infrastructure.environmentParameters,
          prod: infrastructure.environmentParameters.prod.replace(
            'param authenticationRateLimitThreshold = 500',
            'param authenticationRateLimitThreshold = 1000',
          ),
        },
      }),
    ).toContain('The prod environment must define param authenticationRateLimitThreshold = 500.');
  });
});
