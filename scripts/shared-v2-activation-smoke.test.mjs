import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memoryRoot = path.join(repoRoot, 'docs/memories/56-shared-adversarial-reviewer-platform');
const fixtureRoot = path.join(repoRoot, 'scripts/.test-artifacts/shared-v2-activation');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

describe('shared v2 activation smoke', () => {
  it('materializes the closed source tree, validates its registry/policy, and leaves active v1 untouched', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(memoryRoot, 'shared-v2-manifest.json'), 'utf8'));
    const activePaths = [
      '.github/adversarial-agents/unit-test-reviewer/prompt.md',
      'config/adversarial-agents/schema.json',
      'config/adversarial-agents/policy.json',
      'config/adversarial-agents/reviewer-engine.json',
      '.github/workflows/adversarial-review.yml',
    ];
    const activeBefore = new Map(
      await Promise.all(
        activePaths.map(async (activePath) => [activePath, await fs.readFile(path.join(repoRoot, activePath))]),
      ),
    );

    for (const entry of manifest.files) {
      const source = path.join(memoryRoot, entry.sourcePath);
      const destination = path.join(fixtureRoot, entry.destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
      expect(sha256(await fs.readFile(destination))).toBe(entry.sha256);
    }

    const validator = await import(
      pathToFileURL(path.join(fixtureRoot, 'scripts/validate-adversarial-agent-registry.ts')).href
    );
    const matrix = await import(
      pathToFileURL(path.join(fixtureRoot, 'scripts/resolve-adversarial-reviewer-matrix.ts')).href
    );
    for (const registryPath of [
      'config/adversarial-agents/agents-config.json',
      'config/adversarial-agents/shared-v2/agents-config.json',
    ]) {
      const registry = JSON.parse(await fs.readFile(path.join(fixtureRoot, registryPath), 'utf8'));
      expect(validator.validateAgentRegistry(fixtureRoot, registry)).toEqual({
        valid: true,
        errors: [],
        agents: registry.agents,
      });
    }
    expect(matrix.resolveAdversarialReviewerMatrix(fixtureRoot)).toEqual([
      expect.objectContaining({
        agentName: 'unit-test-reviewer',
        calibrationReport: expect.stringContaining('/shared-v2/'),
      }),
    ]);

    const registry = JSON.parse(
      await fs.readFile(path.join(fixtureRoot, 'config/adversarial-agents/shared-v2/agents-config.json'), 'utf8'),
    );
    for (const [field, value, expectedError] of [
      ['engineConfigContentHash', '0'.repeat(64), /engineConfigContentHash/],
      ['promptFile', '.github/adversarial-agents/system-policy.md', /promptContentHash/],
      [
        'activeCalibrationReportFile',
        'config/adversarial-agents/active-calibration-unit-test-reviewer.json',
        /agent-specific/,
      ],
    ]) {
      const invalid = structuredClone(registry);
      invalid.agents[0][field] = value;
      expect(validator.validateAgentRegistry(fixtureRoot, invalid)).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([expect.stringMatching(expectedError)]),
      });
    }

    execFileSync(
      'yarn',
      [
        'tsc',
        '--noEmit',
        '--target',
        'es2022',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--allowImportingTsExtensions',
        '--skipLibCheck',
        path.join(fixtureRoot, 'scripts/review-adversarial-context.ts'),
      ],
      { cwd: repoRoot, stdio: 'pipe' },
    );

    for (const [activePath, before] of activeBefore) {
      expect(await fs.readFile(path.join(repoRoot, activePath))).toEqual(before);
    }
  });
});
