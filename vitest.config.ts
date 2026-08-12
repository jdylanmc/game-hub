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
      exclude: [
        '**/*.test.{js,jsx,mjs,cjs,ts,tsx}',
        'src/generated/**',
        'src/main.tsx',
        'src/stories/**',
        'src/storybook/**',
        'src/test/**',
      ],
      excludeAfterRemap: true,
      include: [
        'src/**/*.{ts,tsx}',
        'games/*/src/**/*.{ts,tsx}',
        'packages/game-contract/src/**/*.{ts,tsx}',
        'scripts/generate-game-workspaces.mjs',
      ],
      provider: 'v8',
      reportOnFailure: true,
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        branches: 85.06,
        functions: 94.36,
        lines: 95.27,
        statements: 94.84,
        'games/*/src/**/*.{ts,tsx}': {
          branches: 87.86,
          functions: 90.52,
          lines: 97.39,
          statements: 96.47,
        },
        'games/*/src/simulation.ts': {
          branches: 92,
          functions: 93.54,
          lines: 98.92,
          statements: 97.05,
        },
        'packages/game-contract/src/**/*.{ts,tsx}': {
          branches: 94.73,
          functions: 100,
          lines: 97.43,
          statements: 97.43,
        },
        'scripts/generate-game-workspaces.mjs': {
          branches: 70.27,
          functions: 87.5,
          lines: 82.07,
          statements: 82.4,
        },
        'src/**/*.{ts,tsx}': {
          branches: 86.29,
          functions: 100,
          lines: 95.65,
          statements: 95.88,
        },
      },
    },
  },
});
