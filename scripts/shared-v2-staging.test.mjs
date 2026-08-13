import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createFixtureReviewer,
  evaluateBenchmarks,
  loadCorpus,
  validatePromotionReport,
} from './shared-v2/evaluate-adversarial-reviewer.ts';
import { validateAgentRegistry } from './shared-v2/validate-adversarial-agent-registry.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('shared v2 staging core', () => {
  it('runs the inactive registry, reviewer core, and calibration evaluator without referencing active v1 runtime', async () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/shared-v2/agents-config.json'), 'utf8'),
    );
    expect(validateAgentRegistry(repoRoot, registry)).toMatchObject({ valid: true, errors: [] });

    let timestamp = 0;
    const report = await evaluateBenchmarks({
      repoRoot,
      runMode: 'fixture',
      repetitionsPerCase: 2,
      generatedAt: '2000-01-01T00:00:00.000Z',
      now: () => {
        timestamp += 10;
        return timestamp;
      },
      reviewerFactory: (benchmark) => createFixtureReviewer(repoRoot, benchmark),
    });

    expect(loadCorpus(repoRoot).cases).toHaveLength(18);
    expect(report.metrics).toMatchObject({
      blockingPatternDetectionRate: 1,
      strongFalsePositiveRate: 0,
      missedCriticalScenarios: [],
      errorRate: 0,
    });
    expect(validatePromotionReport(repoRoot, report)).toMatchObject({
      promotable: false,
      reasons: expect.arrayContaining([expect.stringContaining('Only a real Azure calibration run')]),
    });
  });
});
