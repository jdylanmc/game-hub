import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSharedV2Boundary } from './check-shared-v2-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('shared v2 dormant boundary', () => {
  it('keeps a complete fingerprinted v2 payload outside the active v1 workflow', () => {
    expect(checkSharedV2Boundary(repoRoot)).toEqual({ valid: true, errors: [] });
  });

  it('fails closed when a v2 file digest is changed or duplicated', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'docs/memories/56-shared-adversarial-reviewer-platform/shared-v2-manifest.json'),
        'utf8',
      ),
    );
    manifest.files[0].sha256 = '0'.repeat(64);
    expect(checkSharedV2Boundary(repoRoot, manifest)).toMatchObject({ valid: false });
  });
});
