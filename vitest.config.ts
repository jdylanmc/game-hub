import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    allowOnly: false,
    environment: 'jsdom',
    include: [
      'api/**/*.test.ts',
      'src/**/*.test.{ts,tsx}',
      'games/**/*.test.ts',
      'packages/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
    passWithNoTests: false,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      include: [
        'api/src/config.ts',
        'api/src/identity-store.ts',
        'api/src/platform-principal.ts',
        'api/src/server.ts',
        'api/src/session-handler.ts',
        'src/auth/AuthSessionContext.tsx',
        'src/auth/navigation.ts',
        'src/auth/session.ts',
        'src/components/SiteHeader.tsx',
        'src/game-catalog.ts',
        'src/components/games/GameStageStatus.tsx',
        'src/components/ui/Button.tsx',
      ],
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
