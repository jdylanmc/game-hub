import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateAdversarialWorkflowPolicy } from './check-adversarial-workflow-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/adversarial-review.yml'), 'utf8');
const config = JSON.parse(readFileSync(path.join(root, 'config/adversarial-agents/workflow.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function violations({ workflowValue = workflow, configValue = config, packageValue = packageJson } = {}) {
  return validateAdversarialWorkflowPolicy(workflowValue, configValue, packageValue);
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
    ['least write permissions', workflow.replace('checks: write', 'contents: write')],
    [
      'immutable action pins',
      workflow.replace('actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/checkout@v4'),
    ],
    ['required reviewer output', workflow.replaceAll('test -s reviewer-result.json', 'true')],
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
});
