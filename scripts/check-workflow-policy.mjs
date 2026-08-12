import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(rootDirectory, '.github', 'workflows', 'continuous-integration.yml');
const codeownersPath = path.join(rootDirectory, '.github', 'CODEOWNERS');
const workflow = await fs.readFile(workflowPath, 'utf8');
const codeowners = await fs.readFile(codeownersPath, 'utf8');
const ralphRequiredChecks = JSON.parse(
  await fs.readFile(path.join(rootDirectory, 'config', 'ralph-required-checks.json'), 'utf8'),
);
const ralphShellRunner = await fs.readFile(
  path.join(rootDirectory, '.github', 'skills', 'ralph-loop', 'scripts', 'run-ralph-loop.sh'),
  'utf8',
);
const ralphRunner = await fs.readFile(
  path.join(rootDirectory, '.github', 'skills', 'ralph-loop', 'scripts', 'run-ralph-loop.mjs'),
  'utf8',
);
const ralphStatus = await fs.readFile(
  path.join(rootDirectory, '.github', 'skills', 'ralph-loop', 'scripts', 'ralph-status.mjs'),
  'utf8',
);
const violations = [];

const requiredFragments = [
  ['pull request trigger', /^\s{2}pull_request:\s*$/m],
  ['push trigger', /^\s{2}push:\s*$/m],
  ['main push trigger', /^\s{6}- main\s*$/m],
  ['read-only contents permission', /^\s{2}contents: read\s*$/m],
  [
    'pull request concurrency identity',
    /^\s{2}group: continuous-integration-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\s*$/m,
  ],
  ['concurrency cancellation', /^\s{2}cancel-in-progress: true\s*$/m],
  ['required check name', /^\s{4}name: Continuous integration\s*$/m],
  ['pinned runner', /^\s{4}runs-on: ubuntu-24\.04\s*$/m],
  ['job timeout', /^\s{4}timeout-minutes: 30\s*$/m],
  ['fork-safe checkout', /^\s{10}persist-credentials: false\s*$/m],
  ['evidence directory creation', /^\s{8}run: mkdir -p continuous-integration-evidence\s*$/m],
  ['unconditional evidence upload', /^\s{8}if: always\(\)\s*$/m],
  ['fail-closed artifact collection', /^\s{10}if-no-files-found: error\s*$/m],
  ['artifact retention', /^\s{10}retention-days: 14\s*$/m],
];

const requiredArtifactPaths = [
  'continuous-integration-evidence/',
  'test-results/',
  'coverage/',
  'dist/',
  'storybook-static/',
];

for (const [label, pattern] of requiredFragments) {
  if (!pattern.test(workflow)) {
    violations.push(`Missing or weakened ${label}.`);
  }
}

const requiredCommands = [
  'yarn install:check 2>&1 | tee continuous-integration-evidence/install.log',
  'yarn format:check 2>&1 | tee continuous-integration-evidence/format.log',
  'yarn lint 2>&1 | tee continuous-integration-evidence/lint.log',
  'yarn policy:check 2>&1 | tee continuous-integration-evidence/policy.log',
  'yarn generate:check 2>&1 | tee continuous-integration-evidence/generation.log',
  'yarn typecheck 2>&1 | tee continuous-integration-evidence/typecheck.log',
  'yarn security:audit 2>&1 | tee continuous-integration-evidence/security-audit.log',
  'yarn test:coverage 2>&1 | tee continuous-integration-evidence/test.log',
  'yarn build 2>&1 | tee continuous-integration-evidence/build.log',
  'yarn bundle:check 2>&1 | tee continuous-integration-evidence/bundle.log',
  'yarn build-storybook 2>&1 | tee continuous-integration-evidence/storybook.log',
  'yarn test:ci-fail-closed 2>&1 | tee continuous-integration-evidence/fail-closed.log',
];

for (const command of requiredCommands) {
  if (!workflow.includes(`run: ${command}`)) {
    violations.push(`Missing mandatory command: ${command}`);
  }

  const commandPositions = requiredCommands.map((command) => workflow.indexOf(`run: ${command}`));
  for (let index = 1; index < commandPositions.length; index += 1) {
    if (commandPositions[index] <= commandPositions[index - 1]) {
      violations.push(
        `Mandatory deterministic commands are not ordered cheapest-to-most-expensive near: ${requiredCommands[index]}`,
      );
    }
  }
}

for (const artifactPath of requiredArtifactPaths) {
  if (!workflow.includes(`            ${artifactPath}`)) {
    violations.push(`Missing mandatory evidence path: ${artifactPath}`);
  }
}

const requiredCodeOwnerRules = ['/.github/CODEOWNERS @jdylanmc', '/.github/workflows/ @jdylanmc'];

for (const rule of requiredCodeOwnerRules) {
  if (!codeowners.split('\n').includes(rule)) {
    violations.push(`Missing mandatory Code Owner rule: ${rule}`);
  }
}

if (
  ralphRequiredChecks.version !== '1.0.0' ||
  JSON.stringify(ralphRequiredChecks.requiredChecks) !==
    JSON.stringify(['Continuous integration', 'Adversarial Review / unit-test-reviewer'])
) {
  violations.push('Ralph required-check configuration is missing or weakened.');
}

for (const [source, fragments] of [
  [ralphShellRunner, ['exec node "$SCRIPT_DIR/run-ralph-loop.mjs" "$@"']],
  [
    ralphRunner,
    [
      'snapshot.localCommit === snapshot.remoteCommit',
      'snapshot.pullRequestHeadSha === snapshot.localCommit',
      "snapshot.ciState === 'success'",
      "['not-required', 'success'].includes(snapshot.adversarialState)",
    ],
  ],
  [
    ralphStatus,
    [
      "'number,url,state,isDraft,headRefOid,statusCheckRollup'",
      'requiredStatusChecksFromPlan(plan)',
      'duplicates.length || failure.length',
    ],
  ],
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      violations.push(`Ralph completion does not fail closed on required checks: ${fragment}`);
    }
  }
}

for (const line of workflow.split('\n')) {
  const actionReference = line.match(/^\s*uses:\s*[^@\s]+@([^\s#]+)/);
  if (actionReference && !/^[0-9a-f]{40}$/.test(actionReference[1])) {
    violations.push(`Action reference is not pinned to a full commit SHA: ${line.trim()}`);
  }
}

if (/^\s*pull_request_target:\s*$/m.test(workflow)) {
  violations.push('pull_request_target is forbidden for fork-safe validation.');
}
if (/^\s*continue-on-error:\s*true\s*$/m.test(workflow)) {
  violations.push('continue-on-error cannot weaken a mandatory gate.');
}
if (/^\s*permissions:\s*write-all\s*$/m.test(workflow) || /^\s*[\w-]+:\s*write\s*$/m.test(workflow)) {
  violations.push('Write permissions are forbidden in continuous integration.');
}

if (violations.length > 0) {
  throw new Error(`Continuous integration workflow policy failed:\n${violations.join('\n')}`);
}

console.log('Continuous integration workflow policy passed.');
