import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSharedV2Boundary } from './check-shared-v2-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(
  repoRoot,
  'docs/memories/56-shared-adversarial-reviewer-platform/shared-v2-manifest.json',
);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function refreshAggregate(manifest) {
  const entries = [...manifest.files, ...manifest.externalDependencies]
    .map((entry) => {
      const result = { destination: entry.destination, sha256: entry.sha256 };
      if (typeof entry.sourcePath === 'string') result.sourcePath = entry.sourcePath;
      return result;
    })
    .sort((left, right) => left.destination.localeCompare(right.destination));
  manifest.aggregateSha256 = sha256(JSON.stringify(entries));
}

describe('shared v2 dormant boundary', () => {
  it('validates every source hash, destination, closure edge, external hash, and active-v1 isolation', () => {
    expect(checkSharedV2Boundary(repoRoot)).toEqual({ valid: true, errors: [] });
  });

  it('fails closed when exactly one source hash is changed', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].sha256 = '0'.repeat(64);
    expect(checkSharedV2Boundary(repoRoot, manifest)).toMatchObject({ valid: false });
  });

  it('fails closed when a JSON registry path is not mapped by the manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files = manifest.files.filter(
      (entry) => entry.destination !== 'config/adversarial-agents/shared-v2/reviewer-engine.json',
    );
    refreshAggregate(manifest);

    expect(checkSharedV2Boundary(repoRoot, manifest)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.stringMatching(/JSON dependency is unmanifested: .*reviewer-engine\.json/),
      ]),
    });
  });

  it('fails closed when a JSON registry hash no longer matches its manifest destination', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const engine = manifest.files.find(
      (entry) => entry.destination === 'config/adversarial-agents/shared-v2/reviewer-engine.json',
    );
    engine.sha256 = '0'.repeat(64);
    refreshAggregate(manifest);

    expect(checkSharedV2Boundary(repoRoot, manifest)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.stringMatching(/JSON content hash is inconsistent: .*engineConfigFile/)]),
    });
  });
});
