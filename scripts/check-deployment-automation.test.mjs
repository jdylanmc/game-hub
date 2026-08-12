import { describe, expect, it } from 'vitest';
import { loadDeploymentAutomation, validateDeploymentAutomation } from './check-deployment-automation.mjs';

const automation = loadDeploymentAutomation();

function violations(overrides = {}) {
  return validateDeploymentAutomation({
    ...automation,
    ...overrides,
  });
}

describe('deployment automation policy', () => {
  it('accepts keyless protected deployment workflows and the complete verification runbook', () => {
    expect(violations()).toEqual([]);
  });

  it.each([
    [
      'explicit subscription selection',
      {
        infrastructureWorkflow: automation.infrastructureWorkflow.replace(
          'az account set --subscription "$AZURE_SUBSCRIPTION_ID"',
          'az account show',
        ),
      },
    ],
    [
      'repeat deployment proof',
      {
        infrastructureWorkflow: automation.infrastructureWorkflow.replace(
          '.changeType != "NoChange" and .changeType != "Ignore"',
          '.changeType == "NoChange"',
        ),
      },
    ],
    [
      'frontend origin restriction',
      {
        frontendWorkflow: automation.frontendWorkflow.split('AzureFrontDoor.Backend').join('Internet'),
      },
    ],
    [
      'immutable API deployment',
      {
        apiWorkflow: automation.apiWorkflow.replace('az acr repository show', 'echo mutable-image'),
      },
    ],
    [
      'Microsoft Entra asset authorization',
      {
        assetWorkflow: automation.assetWorkflow.replace('--auth-mode login', '--account-key placeholder'),
      },
    ],
    [
      'authentication verification',
      {
        documentation: automation.documentation.replace(
          '### 3. Verify frontend-to-API and authentication readiness',
          '### 3. Removed',
        ),
      },
    ],
  ])('rejects removal of %s', (_label, overrides) => {
    expect(violations(overrides)).not.toEqual([]);
  });

  it('rejects a stored GitHub secret dependency', () => {
    expect(
      violations({
        apiWorkflow: `${automation.apiWorkflow}\n          password: \${{ secrets.REGISTRY_PASSWORD }}`,
      }),
    ).toContain('API deployment must not depend on a stored GitHub secret.');
  });
});
