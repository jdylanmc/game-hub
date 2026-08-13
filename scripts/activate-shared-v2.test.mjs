import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { activateSharedV2 } from './activate-shared-v2.mjs';

const fixtures = [];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createFixture() {
  const fixtureParent = path.join(process.cwd(), 'scripts/.test-artifacts');
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'shared-v2-activation-'));
  fixtures.push(root);
  const memoryRoot = path.join(root, 'memory');
  const sourceRoot = path.join(memoryRoot, 'dormant-source');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'runtime.ts'), 'export const contract = 2;\n');
  fs.writeFileSync(path.join(sourceRoot, 'config.json'), '{"version":"2.0.0"}\n');
  const manifestPath = path.join(memoryRoot, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      files: [
        {
          sourcePath: 'dormant-source/config.json',
          destination: 'config/adversarial-agents/config.json',
          sha256: sha256(fs.readFileSync(path.join(sourceRoot, 'config.json'))),
        },
        {
          sourcePath: 'dormant-source/runtime.ts',
          destination: 'scripts/runtime.ts',
          sha256: sha256(fs.readFileSync(path.join(sourceRoot, 'runtime.ts'))),
        },
      ],
      externalDependencies: [],
    }),
  );
  return { root, manifestPath };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

describe('shared v2 activation', () => {
  it('validates every source digest before atomically materializing all reviewed destinations', () => {
    const { root, manifestPath } = createFixture();

    expect(activateSharedV2({ repoRoot: root, manifestPath })).toEqual({
      written: ['config/adversarial-agents/config.json', 'scripts/runtime.ts'],
      unchanged: [],
    });
    expect(fs.readFileSync(path.join(root, 'config/adversarial-agents/config.json'), 'utf8')).toBe(
      '{"version":"2.0.0"}\n',
    );
    expect(fs.readFileSync(path.join(root, 'scripts/runtime.ts'), 'utf8')).toBe('export const contract = 2;\n');
  });

  it('fails before writing when any dormant source digest is invalid', () => {
    const { root, manifestPath } = createFixture();
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(() => activateSharedV2({ repoRoot: root, manifestPath })).toThrow(/digest mismatch/);
    expect(fs.existsSync(path.join(root, 'config/adversarial-agents/config.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'scripts/runtime.ts'))).toBe(false);
  });
});
