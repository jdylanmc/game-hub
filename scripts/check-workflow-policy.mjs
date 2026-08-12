import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(rootDirectory, '.github', 'workflows', 'continuous-integration.yml');
const codeownersPath = path.join(rootDirectory, '.github', 'CODEOWNERS');
const workflow = await fs.readFile(workflowPath, 'utf8');
const codeowners = await fs.readFile(codeownersPath, 'utf8');
const packageManifest = JSON.parse(await fs.readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const ralphRequiredChecks = JSON.parse(
  await fs.readFile(path.join(rootDirectory, 'config', 'ralph-required-checks.json'), 'utf8'),
);
const ralphIterationPrompt = await fs.readFile(
  path.join(rootDirectory, '.github', 'skills', 'ralph-loop', 'references', 'iteration-prompt.md'),
  'utf8',
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
const lintBehaviorProof = await fs.readFile(path.join(rootDirectory, 'scripts', 'prove-lint-behavior.mjs'), 'utf8');
const continuousIntegrationFailureProof = await fs.readFile(
  path.join(rootDirectory, 'scripts', 'prove-ci-fail-closed.mjs'),
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
  ['fail-closed run shell', /^ {4}defaults:\s*\n {6}run:\s*\n {8}shell: bash -eo pipefail \{0\}\s*$/m],
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
  'yarn install --immutable 2>&1 | tee continuous-integration-evidence/install.log',
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
}

const commandPositions = requiredCommands.map((command) => workflow.indexOf(`run: ${command}`));
for (let index = 1; index < commandPositions.length; index += 1) {
  if (commandPositions[index] <= commandPositions[index - 1]) {
    violations.push(
      `Mandatory deterministic commands are not ordered cheapest-to-most-expensive near: ${requiredCommands[index]}`,
    );
  }
}

violations.push(...validateContinuousIntegrationBootstrapPolicy(workflow));
violations.push(
  ...validateLintIntegrationPolicy({
    continuousIntegrationFailureProof,
    lintBehaviorProof,
    packageManifest,
    ralphIterationPrompt,
    workflow,
  }),
);

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

function validateContinuousIntegrationBootstrapPolicy(workflowSource) {
  const bootstrapViolations = [];
  const shellLines = workflowSource.match(/^ {8}shell:.*$/gm) ?? [];
  const pipedEvidenceCommands = workflowSource
    .split('\n')
    .filter((line) => /^ {8}run: .* 2>&1 \| tee continuous-integration-evidence\/.+\.log\s*$/.test(line));

  if (shellLines.length !== 1 || shellLines[0] !== '        shell: bash -eo pipefail {0}') {
    bootstrapViolations.push('Every piped evidence command must inherit the sole bash -eo pipefail run shell.');
  }
  if (pipedEvidenceCommands.length !== requiredCommands.length) {
    bootstrapViolations.push('Every mandatory deterministic command must retain piped evidence.');
  }
  if (
    !workflowSource.includes('run: yarn install --immutable 2>&1 | tee continuous-integration-evidence/install.log') ||
    workflowSource.includes('yarn install:check')
  ) {
    bootstrapViolations.push('Fresh runners must bootstrap dependencies with direct yarn install --immutable.');
  }

  return bootstrapViolations;
}

function validateLintIntegrationPolicy({
  continuousIntegrationFailureProof: failureProofSource,
  lintBehaviorProof: lintProofSource,
  packageManifest: manifest,
  ralphIterationPrompt: iterationPromptSource,
  workflow: workflowSource,
}) {
  const lintViolations = [];
  const expectedScripts = {
    lint: 'yarn lint:scope && eslint . --max-warnings 0',
    'lint:fix': 'yarn lint:scope && eslint . --fix --max-warnings 0',
    'test:ci-fail-closed': 'yarn test:lint && node scripts/prove-ci-fail-closed.mjs',
    'test:lint':
      'vitest run scripts/prove-lint-behavior.test.mjs scripts/check-lint-suppressions.test.mjs --coverage.enabled=false && node scripts/prove-lint-behavior.mjs',
  };
  const expectedLintDependencies = {
    '@eslint/js': '9.39.5',
    '@types/eslint-plugin-jsx-a11y': '6.10.1',
    '@types/node': '24.13.3',
    eslint: '9.39.5',
    'eslint-import-resolver-typescript': '4.4.5',
    'eslint-plugin-import-x': '4.17.1',
    'eslint-plugin-jsx-a11y': '6.10.2',
    'eslint-plugin-promise': '7.3.0',
    'eslint-plugin-react': '7.37.5',
    'eslint-plugin-react-hooks': '7.1.1',
    globals: '17.9.0',
    typescript: '5.9.3',
    'typescript-eslint': '8.66.0',
  };

  if (!manifest || typeof manifest !== 'object') {
    return ['The package manifest is unavailable for lint integration policy.'];
  }
  if (manifest.packageManager !== 'yarn@4.17.1' || manifest.engines?.node !== '24.13.0') {
    lintViolations.push('Local lint runtime pins are missing or weakened.');
  }
  for (const [scriptName, expectedCommand] of Object.entries(expectedScripts)) {
    if (manifest.scripts?.[scriptName] !== expectedCommand) {
      lintViolations.push(`Canonical lint script is missing or weakened: ${scriptName}`);
    }
  }
  if (
    typeof manifest.scripts?.validate !== 'string' ||
    !manifest.scripts.validate.includes('yarn lint') ||
    !manifest.scripts.validate.includes('yarn test:ci-fail-closed')
  ) {
    lintViolations.push('The local validation contract must include canonical lint and lint proofs.');
  }
  for (const [dependencyName, expectedVersion] of Object.entries(expectedLintDependencies)) {
    if (manifest.devDependencies?.[dependencyName] !== expectedVersion) {
      lintViolations.push(`Lint dependency is missing or not pinned to ${expectedVersion}: ${dependencyName}`);
    }
  }

  for (const fragment of [
    'node-version: 24.13.0',
    'run: corepack enable',
    'run: yarn install --immutable 2>&1 | tee continuous-integration-evidence/install.log',
    'run: yarn lint 2>&1 | tee continuous-integration-evidence/lint.log',
    'run: yarn test:ci-fail-closed 2>&1 | tee continuous-integration-evidence/fail-closed.log',
    '            continuous-integration-evidence/',
  ]) {
    if (occurrences(workflowSource, fragment) !== 1) {
      lintViolations.push(`Continuous integration lint contract must contain exactly one: ${fragment}`);
    }
  }

  for (const fragment of [
    "runRequired('baseline canonical lint', yarnExecutable, ['lint']);",
    'await proveWarningsFailCanonicalLint();',
    'await proveCanonicalFixSafety();',
    'Every representative diagnostic must include a file line and column.',
    'Canonical lint output did not attribute failure to --max-warnings 0.',
  ]) {
    if (!lintProofSource.includes(fragment)) {
      lintViolations.push(`Representative lint behavior proof is missing or weakened: ${fragment}`);
    }
  }
  for (const fragment of [
    "label: 'lint'",
    "runPipedSandbox(yarnExecutable, ['lint'], 'continuous-integration-evidence/lint.log')",
    'verify: () => assertActionableLintEvidence',
  ]) {
    if (!failureProofSource.includes(fragment)) {
      lintViolations.push(`Protected lint failure proof is missing or weakened: ${fragment}`);
    }
  }
  for (const fragment of [
    'Run the canonical root `yarn lint` command; direct `eslint` or workspace-only commands are not completion evidence.',
    'run `yarn test:lint` and `yarn policy:check`',
  ]) {
    if (!iterationPromptSource.includes(fragment)) {
      lintViolations.push(`Ralph lint completion contract is missing or weakened: ${fragment}`);
    }
  }

  return lintViolations;
}

function occurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

export { validateContinuousIntegrationBootstrapPolicy, validateLintIntegrationPolicy };
