import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveAdversarialReviewerMatrix } from './resolve-adversarial-reviewer-matrix.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('v2 activation compatibility', () => {
  it('keeps the unit-test check identity while routing activated execution through the v2 calibration and fan-in', () => {
    const workflow = readFileSync(path.join(repoRoot, '.github/workflows/adversarial-review.yml'), 'utf8');

    expect(workflow).toContain('ADVERSARIAL_AGENT_NAME: unit-test-reviewer');
    expect(workflow).toContain('config/adversarial-agents/shared-v2/active-calibration-unit-test-reviewer.json');
    expect(workflow).toContain('yarn publish:adversarial-fan-in');
    expect(resolveAdversarialReviewerMatrix(repoRoot)).toEqual([
      expect.objectContaining({
        agentName: 'unit-test-reviewer',
        checkName: 'Adversarial Review / unit-test-reviewer',
        calibrationReport: 'config/adversarial-agents/shared-v2/active-calibration-unit-test-reviewer.json',
      }),
    ]);
  });
});
