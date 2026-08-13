import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveAdversarialReviewerMatrix } from './resolve-adversarial-reviewer-matrix.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('resolveAdversarialReviewerMatrix', () => {
  it('returns one independently attributable entry for every enabled reviewer', () => {
    expect(resolveAdversarialReviewerMatrix(repoRoot)).toEqual([
      {
        agentName: 'unit-test-reviewer',
        checkName: 'Adversarial Review / unit-test-reviewer',
        calibrationReport: 'config/adversarial-agents/shared-v2/active-calibration-unit-test-reviewer.json',
        deploymentId: 'game-hub-unit-test-reviewer',
      },
    ]);
  });
});
