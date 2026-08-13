import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memoryRoot = path.join(repoRoot, 'docs/memories/56-shared-adversarial-reviewer-platform');
const fixtureRoot = path.join(repoRoot, 'scripts/.test-artifacts/shared-v2-activation');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

afterEach(async () => {
  await fsp.rm(fixtureRoot, { recursive: true, force: true });
});

describe('shared v2 activation smoke', () => {
  it('materializes the complete dormant tree into intended destinations without changing active v1 files', async () => {
    const manifest = JSON.parse(await fsp.readFile(path.join(memoryRoot, 'shared-v2-manifest.json'), 'utf8'));
    const activePaths = [
      '.github/adversarial-agents/unit-test-reviewer/prompt.md',
      'config/adversarial-agents/schema.json',
      'config/adversarial-agents/policy.json',
      'config/adversarial-agents/reviewer-engine.json',
      '.github/workflows/adversarial-review.yml',
    ];
    const activeBefore = new Map(
      await Promise.all(
        activePaths.map(async (activePath) => [activePath, await fsp.readFile(path.join(repoRoot, activePath))]),
      ),
    );

    for (const entry of manifest.files) {
      const source = path.join(memoryRoot, entry.sourcePath);
      const destination = path.join(fixtureRoot, entry.destination);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(source, destination);
      expect(sha256(await fsp.readFile(destination))).toBe(entry.sha256);
    }

    const registry = JSON.parse(
      await fsp.readFile(path.join(fixtureRoot, 'config/adversarial-agents/shared-v2/agents-config.json'), 'utf8'),
    );
    const unitReviewer = registry.agents.find((agent) => agent.name === 'unit-test-reviewer');
    expect(unitReviewer).toBeDefined();
    for (const [fileField, hashField] of [
      ['promptFile', 'promptContentHash'],
      ['schemaFile', 'schemaContentHash'],
      ['policyFile', 'policyContentHash'],
      ['engineConfigFile', 'engineConfigContentHash'],
    ]) {
      expect(sha256(await fsp.readFile(path.join(fixtureRoot, unitReviewer[fileField])))).toBe(unitReviewer[hashField]);
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
      expect(await fsp.readFile(path.join(repoRoot, activePath))).toEqual(before);
    }
  });
});
