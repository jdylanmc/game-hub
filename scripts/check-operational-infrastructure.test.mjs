import { describe, expect, it } from 'vitest';
import {
  loadOperationalInfrastructure,
  validateOperationalInfrastructure,
} from './check-operational-infrastructure.mjs';

const infrastructure = loadOperationalInfrastructure();

function violations(overrides = {}) {
  return validateOperationalInfrastructure({
    ...infrastructure,
    ...overrides,
  });
}

describe('operational infrastructure policy', () => {
  it('accepts managed identity, secure references, diagnostics, and cost guardrails', () => {
    expect(violations()).toEqual([]);
  });

  it.each([
    [
      'least-privilege runtime role',
      {
        secureConfigurationModule: infrastructure.secureConfigurationModule.replace(
          "'4633458b-17de-408a-b874-0445c86b69e6'",
          "'00000000-0000-0000-0000-000000000000'",
        ),
      },
    ],
    [
      'managed Key Vault reference',
      {
        containerAppModule: infrastructure.containerAppModule.replace(
          'keyVaultUrl: secretReference.keyVaultSecretUri',
          'name: secretReference.name',
        ),
      },
    ],
    [
      'Log Analytics daily cap',
      {
        observabilityModule: infrastructure.observabilityModule.replace(
          'dailyQuotaGb: dailyIngestionCapGb',
          'dailyQuotaGb: -1',
        ),
      },
    ],
    [
      'Front Door diagnostics',
      {
        observabilityModule: infrastructure.observabilityModule.replace(
          'resource frontDoorDiagnostics',
          'resource removedFrontDoorDiagnostics',
        ),
      },
    ],
    [
      'production purge protection',
      {
        environmentParameters: {
          ...infrastructure.environmentParameters,
          prod: infrastructure.environmentParameters.prod.replace(
            'param keyVaultPurgeProtectionEnabled = true',
            'param keyVaultPurgeProtectionEnabled = false',
          ),
        },
      },
    ],
    [
      'development replica ceiling',
      {
        environmentParameters: {
          ...infrastructure.environmentParameters,
          dev: infrastructure.environmentParameters.dev.replace('param apiMaxReplicas = 2', 'param apiMaxReplicas = 9'),
        },
      },
    ],
    [
      'immutable GitHub identity subject',
      {
        mainTemplate: infrastructure.mainTemplate.replace(
          'repo:jdylanmc@6954990/game-hub@1330993568:environment:',
          'repo:jdylanmc/game-hub:environment:',
        ),
      },
    ],
  ])('rejects removal of the %s', (_label, overrides) => {
    expect(violations(overrides)).not.toEqual([]);
  });

  it('rejects a credential-bearing field', () => {
    expect(
      violations({
        secureConfigurationModule: `${infrastructure.secureConfigurationModule}\nparam sharedKey string`,
      }),
    ).toContain('Operational infrastructure contains forbidden credential field: sharedKey.');
  });

  it('rejects a committed Key Vault secret resource', () => {
    expect(
      violations({
        secureConfigurationModule:
          `${infrastructure.secureConfigurationModule}\n` + "resource example 'Microsoft.KeyVault/vaults/secrets' = {}",
      }),
    ).toContain('Hosting infrastructure must not declare secret values.');
  });
});
