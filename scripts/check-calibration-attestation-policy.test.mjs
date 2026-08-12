import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateCalibrationAttestationPolicy } from './check-calibration-attestation-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = {
  policy: JSON.parse(
    fs.readFileSync(
      path.join(root, 'config/adversarial-agents/gilfoyle-security-architect/calibration-attestation-policy.json'),
      'utf8',
    ),
  ),
  packageJson: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
  source: fs.readFileSync(path.join(root, 'scripts/calibration-attestation.ts'), 'utf8'),
  promotionPolicy: JSON.parse(
    fs.readFileSync(
      path.join(root, 'config/adversarial-agents/gilfoyle-security-architect/promotion-policy.json'),
      'utf8',
    ),
  ),
  workflow: fs.readFileSync(path.join(root, '.github/workflows/adversarial-calibration.yml'), 'utf8'),
};

function cloneBaseline() {
  return structuredClone(baseline);
}

describe('calibration attestation repository policy', () => {
  it('accepts the reviewed protected-run attestation contract', () => {
    expect(validateCalibrationAttestationPolicy(cloneBaseline())).toEqual([]);
  });

  it.each([
    ['repository identity', (input) => (input.policy.repository.repositoryId = '22')],
    ['protected ref', (input) => (input.policy.repository.protectedRef = 'refs/heads/feature')],
    ['signer workflow', (input) => (input.policy.trustedBuilder.workflowPath = '.github/workflows/other.yml')],
    ['workload subject', (input) => (input.policy.trustedBuilder.workloadIdentitySubject = 'repo:mutable')],
    ['attestation action', (input) => (input.policy.attestationAction.commit = 'main')],
    ['Azure deployment', (input) => (input.policy.azureDeployment.deploymentId = 'other')],
    ['freshness', (input) => (input.policy.freshness.maximumAttestationAgeSeconds = 86400)],
    ['fingerprints', (input) => input.policy.requiredReportFingerprintComponents.pop()],
  ])('rejects weakened %s', (_name, mutate) => {
    const input = cloneBaseline();
    mutate(input);
    expect(validateCalibrationAttestationPolicy(input)).not.toEqual([]);
  });

  it('rejects removal of cryptographic verification and replay controls', () => {
    const input = cloneBaseline();
    input.source = input.source
      .replace("'--signer-digest'", "'--weakened-signer-digest'")
      .replace('verifiedOutput.length !== 1', 'verifiedOutput.length < 1');
    expect(validateCalibrationAttestationPolicy(input)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--signer-digest'),
        expect.stringContaining('verifiedOutput.length !== 1'),
      ]),
    );
  });

  it('rejects promotion or optional policy enforcement', () => {
    const input = cloneBaseline();
    input.promotionPolicy.promotionAllowed = true;
    input.packageJson.scripts['policy:check'] = input.packageJson.scripts['policy:check'].replace(
      ' && yarn policy:calibration-attestation',
      '',
    );
    expect(validateCalibrationAttestationPolicy(input)).toEqual(
      expect.arrayContaining([
        'Calibration attestation commands are not mandatory repository policy.',
        'Gilfoyle promotion thresholds must remain strict and unpromoted without valid evidence.',
      ]),
    );
  });

  it('rejects a non-protected, unpinned, or secret-backed calibration workflow', () => {
    const input = cloneBaseline();
    input.workflow = input.workflow
      .replace("if: github.ref == 'refs/heads/main'", "if: github.ref == 'refs/heads/feature'")
      .replace('actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6', 'actions/attest@v4')
      .replace('contents: read', 'write-all')
      .concat('\nAZURE_OPENAI_API_KEY: unsafe\n');
    expect(validateCalibrationAttestationPolicy(input)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('refs/heads/main'),
        expect.stringContaining('not pinned'),
        'Protected calibration workflow exposes credentials or weakens fail-closed execution.',
      ]),
    );
  });
});
