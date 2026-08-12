import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateContinuousIntegrationBootstrapPolicy,
  validateDeterministicSecurityWorkflowPolicy,
} from './check-workflow-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/continuous-integration.yml'), 'utf8');
const deterministicEvidenceConfig = JSON.parse(
  readFileSync(
    path.join(root, 'config/adversarial-agents/gilfoyle-security-architect/deterministic-evidence.json'),
    'utf8',
  ),
);

describe('continuous integration bootstrap policy', () => {
  it('accepts direct immutable bootstrap with fail-closed evidence pipelines', () => {
    expect(validateContinuousIntegrationBootstrapPolicy(workflow)).toEqual([]);
  });

  describe('deterministic security workflow policy', () => {
    it('accepts immutable least-privilege security checks and the fail-closed aggregate', () => {
      expect(validateDeterministicSecurityWorkflowPolicy(workflow, deterministicEvidenceConfig)).toEqual([]);
    });

    it.each([
      [
        'a mutable CodeQL action',
        workflow.replace(
          'github/codeql-action/init@c4dd10e44af883a891fe31ced449bcb4a6728b9b',
          'github/codeql-action/init@v3',
        ),
      ],
      ['a warning-only dependency review', workflow.replace('warn-only: false', 'warn-only: true')],
      ['CodeQL result upload privileges', workflow.replace('upload: never', 'upload: always')],
      ['a masked security result', workflow.replace('test "$SECURITY_RESULT" = success', 'echo "$SECURITY_RESULT"')],
      [
        'write permission in the untrusted job',
        workflow.replace(
          '    permissions:\n      contents: read',
          '    permissions:\n      contents: read\n      pull-requests: write',
        ),
      ],
    ])('rejects %s', (_label, workflowValue) => {
      expect(validateDeterministicSecurityWorkflowPolicy(workflowValue, deterministicEvidenceConfig)).not.toEqual([]);
    });
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
