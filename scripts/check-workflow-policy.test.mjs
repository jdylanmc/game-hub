import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateContinuousIntegrationBootstrapPolicy,
  validateLintIntegrationPolicy,
  validateTestIntegrationPolicy,
} from './check-workflow-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/continuous-integration.yml'), 'utf8');
const packageManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const ralphIterationPrompt = readFileSync(
  path.join(root, '.github/skills/ralph-loop/references/iteration-prompt.md'),
  'utf8',
);
const lintBehaviorProof = readFileSync(path.join(root, 'scripts/prove-lint-behavior.mjs'), 'utf8');
const continuousIntegrationFailureProof = readFileSync(path.join(root, 'scripts/prove-ci-fail-closed.mjs'), 'utf8');
const testIntegrity = readFileSync(path.join(root, 'scripts/check-test-integrity.mjs'), 'utf8');
const vitestConfig = readFileSync(path.join(root, 'vitest.config.ts'), 'utf8');

function lintPolicy(overrides = {}) {
  return validateLintIntegrationPolicy({
    continuousIntegrationFailureProof,
    lintBehaviorProof,
    packageManifest,
    ralphIterationPrompt,
    workflow,
    ...overrides,
  });
}

function testPolicy(overrides = {}) {
  return validateTestIntegrationPolicy({
    continuousIntegrationFailureProof,
    packageManifest,
    testIntegrity,
    vitestConfig,
    workflow,
    ...overrides,
  });
}

describe('continuous integration bootstrap policy', () => {
  it('accepts direct immutable bootstrap with fail-closed evidence pipelines', () => {
    expect(validateContinuousIntegrationBootstrapPolicy(workflow)).toEqual([]);
  });

  it.each([
    ['script-based bootstrap on a fresh runner', workflow.replace('yarn install --immutable', 'yarn install:check')],
    ['a shell that can mask pipeline failures', workflow.replace('shell: bash -eo pipefail {0}', 'shell: bash -e {0}')],
    [
      'a step-level shell override',
      workflow.replace(
        '        run: yarn lint 2>&1 | tee continuous-integration-evidence/lint.log',
        '        shell: bash -e {0}\n        run: yarn lint 2>&1 | tee continuous-integration-evidence/lint.log',
      ),
    ],
  ])('rejects %s', (_label, workflowValue) => {
    expect(validateContinuousIntegrationBootstrapPolicy(workflowValue)).not.toEqual([]);
  });
});

describe('lint integration policy', () => {
  it('accepts the canonical local, workflow, proof, and Ralph contract', () => {
    expect(lintPolicy()).toEqual([]);
  });

  it.each([
    [
      'warning tolerance',
      {
        packageManifest: {
          ...packageManifest,
          scripts: { ...packageManifest.scripts, lint: 'yarn lint:scope && eslint .' },
        },
      },
    ],
    [
      'an unpinned lint dependency',
      {
        packageManifest: {
          ...packageManifest,
          devDependencies: { ...packageManifest.devDependencies, eslint: '^9.39.5' },
        },
      },
    ],
    [
      'a workflow-only ESLint command',
      { workflow: workflow.replace('run: yarn lint 2>&1', 'run: yarn eslint . 2>&1') },
    ],
    [
      'the representative workflow proof',
      {
        workflow: workflow.replace(
          'run: yarn test:ci-fail-closed 2>&1',
          'run: node scripts/prove-ci-fail-closed.mjs 2>&1',
        ),
      },
    ],
    [
      'the representative local proof',
      {
        packageManifest: {
          ...packageManifest,
          scripts: {
            ...packageManifest.scripts,
            'test:ci-fail-closed': 'node scripts/prove-ci-fail-closed.mjs',
          },
        },
      },
    ],
    [
      'actionable diagnostic validation',
      {
        lintBehaviorProof: lintBehaviorProof.replace(
          'Every representative diagnostic must include a file line and column.',
          'Representative diagnostics were observed.',
        ),
      },
    ],
    [
      'retained protected lint evidence',
      {
        continuousIntegrationFailureProof: continuousIntegrationFailureProof.replace(
          "runPipedSandbox(yarnExecutable, ['lint'], 'continuous-integration-evidence/lint.log')",
          "runSandbox(yarnExecutable, ['lint'])",
        ),
      },
    ],
    [
      'the Ralph canonical lint command',
      {
        ralphIterationPrompt: ralphIterationPrompt.replace(
          'Run the canonical root `yarn lint` command',
          'Run a lint command',
        ),
      },
    ],
  ])('rejects weakening or removal of %s', (_label, overrides) => {
    expect(lintPolicy(overrides)).not.toEqual([]);
  });
});

describe('test integration policy', () => {
  it('accepts the canonical watch, deterministic run, discovery, and workflow contract', () => {
    expect(testPolicy()).toEqual([]);
  });

  it.each([
    [
      'an interactive default test command',
      {
        packageManifest: {
          ...packageManifest,
          scripts: { ...packageManifest.scripts, test: 'yarn test:watch' },
        },
      },
    ],
    [
      'focused tests',
      {
        vitestConfig: vitestConfig.replace('allowOnly: false', 'allowOnly: true'),
      },
    ],
    [
      'unbounded test timeouts',
      {
        vitestConfig: vitestConfig.replace('testTimeout: 10_000', 'testTimeout: 0'),
      },
    ],
    [
      'automatic workspace discovery',
      {
        vitestConfig: vitestConfig.replace(
          'include: createVitestIncludePatterns(packageManifest)',
          "include: ['src/**/*.test.ts']",
        ),
      },
    ],
    [
      'the canonical workflow command',
      {
        workflow: workflow.replace('run: yarn test:ci 2>&1', 'run: yarn test:coverage 2>&1'),
      },
    ],
    [
      'the canonical test failure proof count',
      {
        continuousIntegrationFailureProof: continuousIntegrationFailureProof.replace(
          "runSandbox(yarnExecutable, ['test:ci'])",
          "runSandbox(yarnExecutable, ['test:coverage'])",
        ),
      },
    ],
    [
      'the canonical test failure proof matrix',
      {
        continuousIntegrationFailureProof: continuousIntegrationFailureProof.replace(
          "label: 'coverage regression'",
          "label: 'coverage drift'",
        ),
      },
    ],
  ])('rejects weakening or removal of %s', (_label, overrides) => {
    expect(testPolicy(overrides)).not.toEqual([]);
  });
});
