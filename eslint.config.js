import eslint from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.{ts,tsx}'];
const browserFiles = ['src/**/*.{ts,tsx}', 'games/*/src/**/*.{ts,tsx}', '.storybook/preview.ts'];
const nodeTypescriptFiles = ['*.config.ts', '.storybook/main.ts'];
const testFiles = ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'];
const reactFiles = ['src/**/*.{ts,tsx}', '.storybook/preview.ts'];

export default tseslint.config(
  {
    ignores: [
      '.yarn/',
      'coverage/',
      'dist/',
      'storybook-static/',
      'src/storybook/mamba/generated/',
      'src/storybook/mamba/source/',
    ],
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
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
);
