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

describe('shared v2 dormant boundary', () => {
  it('validates every source hash, destination, closure edge, external hash, and active-v1 isolation', () => {
    expect(checkSharedV2Boundary(repoRoot)).toEqual({ valid: true, errors: [] });
  });

  it('fails closed when exactly one source hash is changed', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].sha256 = '0'.repeat(64);
    expect(checkSharedV2Boundary(repoRoot, manifest)).toMatchObject({ valid: false });
  });
});
