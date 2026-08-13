import eslint from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,cjs,ts,tsx}'];
const typescriptFiles = ['**/*.{ts,tsx}'];
const browserFiles = ['src/**/*.{ts,tsx}', 'games/*/src/**/*.{ts,tsx}', '.storybook/preview.ts'];
const nodeTypescriptFiles = ['*.config.ts', '.storybook/main.ts', 'scripts/**/*.ts'];
const testFiles = ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'];
const reactFiles = ['src/**/*.{ts,tsx}', '.storybook/preview.ts'];
const adversarialToolFiles = [
  'scripts/apply-adversarial-exceptions.ts',
  'scripts/collect-adversarial-context.ts',
  'scripts/evaluate-adversarial-reviewer.ts',
  'scripts/prepare-adversarial-workflow.ts',
  'scripts/publish-adversarial-evidence.ts',
  'scripts/review-adversarial-context.ts',
  'scripts/validate-adversarial-agent-registry.ts',
  'scripts/validate-adversarial-finding.ts',
];

export default tseslint.config(
  {
    ignores: [
      '.yarn/',
      '**/node_modules/',
      '**/coverage/',
      '**/dist/',
      '**/storybook-static/',
      '**/test-results/',
      'public/generated/',
      'src/generated/',
      'src/storybook/mamba/generated/',
      'src/storybook/mamba/source/',
      'src/stories/catalog/mamba/',
      'docs/memories/56-shared-adversarial-reviewer-platform/shared-v2-source/**',
    ],
  },
  {
    files: sourceFiles,
    plugins: {
      'import-x': importX,
    },
    settings: importX.flatConfigs.typescript.settings,
    rules: {
      ...importX.flatConfigs.recommended.rules,
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-named-as-default': 'error',
      'import-x/no-named-as-default-member': 'error',
    },
  },
  {
    files: ['eslint.config.js', 'scripts/generate-mamba-storybook.mjs'],
    rules: {
      // These tool APIs intentionally expose namespace-like default exports.
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },
  {
    files: ['scripts/generate-mamba-storybook.mjs'],
    rules: {
      // TypeScript's CommonJS API is consumed through Node.js default-import interop.
      'import-x/default': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  {
    files: typescriptFiles,
    rules: {
      // TypeScript owns named-import validation, including type-only exports.
      'import-x/named': 'off',
    },
  },
  {
    files: adversarialToolFiles,
    rules: {
      // These schema-driven tools validate untrusted JSON at explicit runtime boundaries.
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: browserFiles,
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: nodeTypescriptFiles,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  },
  {
    files: reactFiles,
    plugins: {
      'jsx-a11y': jsxA11y,
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: '18.3',
      },
      'jsx-a11y': {
        components: {
          Button: 'button',
          Link: 'a',
        },
      },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
);
