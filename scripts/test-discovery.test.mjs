import { describe, expect, it } from 'vitest';

import {
  createVitestIncludePatterns,
  testRootsFromManifest,
  workspacePatternsFromManifest,
} from './test-discovery.mjs';

const manifest = {
  workspaces: ['packages/*', 'games/*'],
};

describe('test discovery', () => {
  it('discovers host, every workspace pattern, and repository scripts deterministically', () => {
    expect(createVitestIncludePatterns(manifest)).toEqual([
      'src/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
      'games/*/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
      'packages/*/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
      'scripts/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
    ]);
    expect(testRootsFromManifest(manifest)).toEqual(['src', 'games', 'packages', 'scripts']);
  });

  it('supports the object form of Yarn workspace declarations without duplicates', () => {
    const objectManifest = {
      workspaces: {
        packages: ['games/*', 'packages/*', 'games/*'],
      },
    };

    expect(workspacePatternsFromManifest(objectManifest)).toEqual(['games/*', 'packages/*']);
  });
});
