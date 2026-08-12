import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateAdversarialWorkflowPolicy } from './check-adversarial-workflow-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/adversarial-review.yml'), 'utf8');
const config = JSON.parse(readFileSync(path.join(root, 'config/adversarial-agents/workflow.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const resolver = readFileSync(path.join(root, 'scripts/prepare-adversarial-workflow.ts'), 'utf8');

function violations({
  workflowValue = workflow,
  configValue = config,
  packageValue = packageJson,
  resolverValue = resolver,
} = {}) {
  return validateAdversarialWorkflowPolicy(workflowValue, configValue, packageValue, resolverValue);
}

describe('adversarial workflow policy', () => {
  it('accepts the reviewed downstream workflow', () => {
    expect(violations()).toEqual([]);
  });

  it.each([
    [
      'exact successful Continuous integration dependency',
      workflow.replace(
        "github.event.workflow_run.conclusion == 'success'",
        "github.event.workflow_run.conclusion != 'success'",
      ),
    ],
    [
      'protected base checkout',
      workflow.replaceAll('ref: ${{ github.sha }}', 'ref: ${{ needs.resolve.outputs.head_sha }}'),
    ],
    ['fresh protected-base dependency bootstrap', workflow.replace('yarn install --immutable', 'yarn install:check')],
    ['least write permissions', workflow.replace('checks: write', 'contents: write')],
    [
      'immutable action pins',
      workflow.replace('actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/checkout@v4'),
    ],
    ['required reviewer output', workflow.replaceAll('test -s reviewer-result.json', 'true')],
    ['required publication output', workflow.replace('test -s publication-result.json', 'true')],
    [
      'exception-aware blocking conclusion',
      workflow.replace("if (publication.conclusion === 'failure') process.exit(1);", 'process.exit(0);'),
    ],
    [
      'protected exception registry',
      workflow.replace(
        '--exceptions config/adversarial-agents/exceptions.json',
        '--exceptions adversarial-context.json',
      ),
    ],
    ['review timeout', workflow.replace('timeout-minutes: 20', 'timeout-minutes: 120')],
    [
      'shared concurrency lane',
      workflow.replace(
        'group: adversarial-review-capacity-${{ needs.resolve.outputs.capacity_slot }}',
        'group: adversarial-review-${{ needs.resolve.outputs.pull_request_number }}',
      ),
    ],
    ['evidence retention', workflow.replace('retention-days: 90', 'retention-days: 1')],
  ])('rejects weakening %s', (_label, workflowValue) => {
    expect(violations({ workflowValue })).not.toEqual([]);
  });

  it('rejects raising shared review capacity above three', () => {
    expect(
      violations({
        configValue: { ...config, maxConcurrentReviews: 4 },
      }),
    ).toContain('Adversarial workflow configuration was weakened.');
  });

  it('rejects treating generic dependency issue prose as source identity', () => {
    expect(
      violations({
        resolverValue: resolver.replace(
          'fix(?:e[sd])?|resolve[sd]?|track(?:s|ed)?',
          'fix(?:e[sd])?|resolve[sd]?|issue|track(?:s|ed)?',
        ),
      }),
    ).toContain('Generic issue prose must not be treated as a source-issue declaration.');
  });

  it('rejects removing canonical Ralph marker and branch agreement checks', () => {
    expect(
      violations({
        resolverValue: resolver.replace(
          'signalGroups.some((references) => references.size > 1)',
          'signalGroups.every((references) => references.size > 1)',
        ),
      }),
    ).not.toEqual([]);
  });
});
