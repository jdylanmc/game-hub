import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateContinuousIntegrationBootstrapPolicy } from './check-workflow-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/continuous-integration.yml'), 'utf8');

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
