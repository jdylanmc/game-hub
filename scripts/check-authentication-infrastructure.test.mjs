import { describe, expect, it } from 'vitest';
import {
  loadAuthenticationInfrastructure,
  validateAuthenticationInfrastructure,
} from './check-authentication-infrastructure.mjs';

const infrastructure = loadAuthenticationInfrastructure();

function violations(overrides = {}) {
  return validateAuthenticationInfrastructure({
    ...infrastructure,
    ...overrides,
  });
}

describe('authentication infrastructure policy', () => {
  it('accepts the keyless Microsoft Entra and linked-backend trust boundary', () => {
    expect(violations()).toEqual([]);
  });

  it.each([
    [
      'managed frontend identity',
      {
        staticWebAppModule: infrastructure.staticWebAppModule.replace("type: 'SystemAssigned'", "type: 'None'"),
      },
    ],
    [
      'linked Container App backend',
      {
        authenticationModule: infrastructure.authenticationModule.replace(
          "kind: 'containerapp'",
          "kind: 'functionapp'",
        ),
      },
    ],
    [
      'keyless provider contract',
      {
        authenticationModule: infrastructure.authenticationModule.replace(
          'clientCredentialRequired: false',
          'clientCredentialRequired: true',
        ),
      },
    ],
    [
      'stable API trust boundary',
      {
        authenticationModule: infrastructure.authenticationModule.replace(
          "apiIngress: 'Azure Static Web Apps linked backend'",
          "apiIngress: 'Direct public Container App endpoint'",
        ),
      },
    ],
    [
      'non-secret API configuration placeholders',
      {
        environmentParameters: {
          ...infrastructure.environmentParameters,
          prod: infrastructure.environmentParameters.prod.replace(
            "value: 'x-ms-client-principal'",
            "value: 'untrusted-client-header'",
          ),
        },
      },
    ],
  ])('rejects removal of the %s', (_label, overrides) => {
    expect(violations(overrides)).not.toEqual([]);
  });

  it('rejects an authentication credential field', () => {
    expect(
      violations({
        authenticationModule: `${infrastructure.authenticationModule}\nparam clientSecret string`,
      }),
    ).toContain('Authentication infrastructure contains forbidden credential field: clientSecret.');
  });

  it('rejects an API route that allows anonymous access', () => {
    const configuration = structuredClone(infrastructure.staticWebAppConfiguration);
    configuration.routes.find((route) => route.route === '/api/*').allowedRoles = ['anonymous'];

    expect(violations({ staticWebAppConfiguration: configuration })).toContain(
      'The same-origin API route must require the authenticated role.',
    );
  });
});
