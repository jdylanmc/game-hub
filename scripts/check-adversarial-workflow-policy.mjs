import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(root, '.github/workflows/adversarial-review.yml'), 'utf8');
const config = JSON.parse(await fs.readFile(path.join(root, 'config/adversarial-agents/workflow.json'), 'utf8'));
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

function validateAdversarialWorkflowPolicy(workflow, config, packageJson) {
  const violations = [];
  const requiredFragments = [
    'name: Adversarial review',
    'workflow_run:',
    '- Continuous integration',
    '- completed',
    'permissions: {}',
    "github.event.workflow_run.event == 'pull_request'",
    "github.event.workflow_run.status == 'completed'",
    "github.event.workflow_run.conclusion == 'success'",
    'repository: ${{ github.repository }}',
    'ref: ${{ github.sha }}',
    'persist-credentials: false',
    'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
    'test "$GITHUB_REF" = \'refs/heads/main\'',
    'contents: read',
    'issues: read',
    'pull-requests: read',
    'checks: write',
    'id-token: write',
    'environment: adversarial-review',
    'AZURE_CORE_OUTPUT: none',
    "if: needs.resolve.outputs.eligible == 'true'",
    'group: adversarial-review-capacity-${{ needs.resolve.outputs.capacity_slot }}',
    'cancel-in-progress: false',
    'timeout-minutes: 10',
    'timeout-minutes: 20',
    '--require-eligible',
    '--expected-head-sha "$EXPECTED_HEAD_SHA"',
    'yarn calibration:check --report "$ACTIVE_CALIBRATION_REPORT"',
    'fetch --no-tags --depth=1 "$HEAD_REPOSITORY_URL" "$HEAD_SHA"',
    'yarn context:collect',
    'https://*.openai.azure.com',
    'allow-no-subscriptions: true',
    'yarn review:adversarial',
    'test -s reviewer-result.json',
    'yarn publish:adversarial',
    'if-no-files-found: error',
    'retention-days: 90',
    'node scripts/validate-adversarial-finding.ts reviewer-result.json',
    "if (result.verdict.decision !== 'PASS') process.exit(1);",
  ];
  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) violations.push(`Missing adversarial workflow invariant: ${fragment}`);
  }

  const calibrationPosition = workflow.indexOf('Validate promoted calibration before model access');
  const contextPosition = workflow.indexOf('Collect bounded untrusted evidence');
  const loginPosition = workflow.indexOf('Sign in to Azure with OpenID Connect');
  const reviewPosition = workflow.indexOf('Invoke bounded Azure reviewer');
  const reverifyPosition = workflow.indexOf('Revalidate head immediately before publication');
  const publishPosition = workflow.indexOf('Publish exact-head check and retained evidence');
  if (
    [calibrationPosition, contextPosition, loginPosition, reviewPosition, reverifyPosition, publishPosition].some(
      (position) => position < 0,
    ) ||
    !(
      calibrationPosition < contextPosition &&
      contextPosition < loginPosition &&
      loginPosition < reviewPosition &&
      reviewPosition < reverifyPosition &&
      reverifyPosition < publishPosition
    )
  ) {
    violations.push('Adversarial workflow safety steps are missing or ordered unsafely.');
  }

  for (const line of workflow.split('\n')) {
    const actionReference = line.match(/^\s*uses:\s*[^@\s]+@([^\s#]+)/);
    if (actionReference && !/^[0-9a-f]{40}$/.test(actionReference[1])) {
      violations.push(`Action reference is not pinned to a full commit SHA: ${line.trim()}`);
    }
  }

  if (
    /^\s{2}(pull_request|pull_request_target|push):\s*$/m.test(workflow) ||
    workflow.includes('actions/download-artifact') ||
    workflow.includes('continue-on-error: true') ||
    workflow.includes('ref: ${{ github.event.workflow_run.head_sha }}') ||
    workflow.includes('ref: ${{ needs.resolve.outputs.head_sha }}') ||
    (workflow.includes('checkout@') && !workflow.includes('persist-credentials: false'))
  ) {
    violations.push('Adversarial workflow may not execute or check out pull-request-controlled code.');
  }

  const writePermissions = [...workflow.matchAll(/^\s{6}([a-z-]+): write\s*$/gm)].map((match) => match[1]);
  if (
    writePermissions.length !== 2 ||
    !writePermissions.includes('checks') ||
    !writePermissions.includes('id-token') ||
    workflow.includes('write-all') ||
    workflow.includes('secrets.')
  ) {
    violations.push('Adversarial workflow permissions exceed checks and job-scoped OpenID Connect writes.');
  }
  if (
    (workflow.match(/id-token: write/g) ?? []).length !== 1 ||
    (workflow.match(/checks: write/g) ?? []).length !== 1 ||
    (workflow.match(/yarn review:adversarial/g) ?? []).length !== 1
  ) {
    violations.push('Inference identity, check publication, and model invocation must occur exactly once.');
  }

  const installCommands = workflow.match(/\byarn install[^\n]*/g) ?? [];
  if (installCommands.length !== 2 || installCommands.some((command) => command.trim() !== 'yarn install:check')) {
    violations.push('Only protected-base immutable dependency installation is allowed.');
  }

  if (
    config.version !== '1.0.0' ||
    config.deterministicWorkflowName !== 'Continuous integration' ||
    config.deterministicWorkflowPath !== '.github/workflows/continuous-integration.yml' ||
    config.trustedBaseBranch !== 'main' ||
    config.maxConcurrentReviews !== 3 ||
    config.maxChangedFiles !== 500 ||
    config.reviewTimeoutMinutes !== 20 ||
    config.artifactRetentionDays !== 90
  ) {
    violations.push('Adversarial workflow configuration was weakened.');
  }

  if (
    packageJson.scripts?.['workflow:prepare-adversarial'] !== 'node scripts/prepare-adversarial-workflow.ts' ||
    packageJson.scripts?.['policy:adversarial-workflow'] !== 'node scripts/check-adversarial-workflow-policy.mjs'
  ) {
    violations.push('Canonical adversarial workflow preparation or policy command is missing.');
  }

  return violations;
}

const violations = validateAdversarialWorkflowPolicy(workflow, config, packageJson);
if (violations.length > 0) {
  throw new Error(`Adversarial workflow policy failed:\n${violations.join('\n')}`);
}

console.log('Fork-safe adversarial workflow policy passed.');

export { validateAdversarialWorkflowPolicy };
