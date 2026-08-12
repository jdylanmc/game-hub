import { readFileSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

import { createVitestIncludePatterns } from './scripts/test-discovery.mjs';

const packageManifest: unknown = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  test: {
    allowOnly: false,
    environment: 'jsdom',
    hookTimeout: 10_000,
    include: createVitestIncludePatterns(packageManifest),
    passWithNoTests: false,
    retry: 0,
    sequence: {
      seed: 29005,
      shuffle: true,
    },
    setupFiles: ['./src/test/setup.ts'],
    teardownTimeout: 10_000,
    testTimeout: 10_000,
    coverage: {
      include: ['src/game-catalog.ts', 'src/components/games/GameStageStatus.tsx', 'src/components/ui/Button.tsx'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        branches: 75,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
