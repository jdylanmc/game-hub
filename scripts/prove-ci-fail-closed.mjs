import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await fs.mkdtemp(path.join(rootDirectory, '.ci-fail-closed-proof-'));
const sandboxDirectory = path.join(temporaryRoot, 'repository');
const yarnExecutable = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
let worktreeCreated = false;
let runError;

try {
  runRequired('create detached proof worktree', 'git', ['worktree', 'add', '--detach', sandboxDirectory, 'HEAD'], {
    cwd: rootDirectory,
  });
  worktreeCreated = true;
  await syncCurrentPolicySources();
  await proveFreshBootstrap();
  await fs.mkdir(sandboxPath('continuous-integration-evidence'), { recursive: true });

  await proveFailure({
    expected: /Code style issues found|scripts\/ci-failure-probe\.mjs/,
    label: 'formatting',
    prepare: () => createProbeFile('scripts/ci-failure-probe.mjs', 'const badlyFormatted={value:"broken"}\n'),
    run: () => runPipedSandbox(yarnExecutable, ['format:check'], 'continuous-integration-evidence/format.log'),
  });

  await proveFailure({
    expected: /no-unused-vars/,
    label: 'lint',
    prepare: () => createProbeFile('scripts/ci-failure-probe.mjs', 'const unused = 1;\n'),
    run: () => runPipedSandbox(yarnExecutable, ['lint'], 'continuous-integration-evidence/lint.log'),
    verify: () => assertActionableLintEvidence('continuous-integration-evidence/lint.log'),
  });

  await proveFailure({
    expected: /TS2322/,
    label: 'type checking',
    prepare: () => createProbeFile('src/ci-failure-probe.ts', 'export const invalid: string = 1;\n'),
    run: () => runSandbox(yarnExecutable, ['typecheck']),
  });

  await proveCanonicalTestFailures();

  await proveFailure({
    expected: /generation changed the repository state|outputs are dirty/,
    label: 'generated state',
    prepare: () => replaceFile('public/generated/games.manifest.json', (content) => `${content.trimEnd()}\n `),
    run: () => runSandbox(yarnExecutable, ['generate:check']),
  });

  await proveFailure({
    expected: /Could not resolve|Failed to resolve/,
    label: 'production build',
    prepare: () =>
      replaceFile('index.html', (content) => content.replace('/src/main.tsx', '/src/ci-missing-entry.tsx')),
    run: () => runSandbox(yarnExecutable, ['build']),
  });

  runRequired('prepare production bundle evidence', yarnExecutable, ['build']);

  await proveFailure({
    expected: /Bundle budgets exceeded/,
    label: 'bundle budget',
    prepare: () =>
      replaceFile('config/bundle-budgets.json', (content) => {
        const budgets = JSON.parse(content);
        return `${JSON.stringify(
          Object.fromEntries(Object.keys(budgets).map((budgetName) => [budgetName, 1])),
          null,
          2,
        )}\n`;
      }),
    run: () => runSandbox(yarnExecutable, ['bundle:check']),
  });

  await proveFailure({
    expected: /Unable to read Vite build manifest/,
    label: 'missing build output',
    prepare: async () => {
      const manifestPath = sandboxPath('dist/.vite/manifest.json');
      const manifest = await fs.readFile(manifestPath);
      await fs.rm(manifestPath);
      return () => fs.writeFile(manifestPath, manifest);
    },
    run: () => runSandbox(yarnExecutable, ['bundle:check']),
  });

  await proveFailure({
    expected: /Missing mandatory command/,
    label: 'missing mandatory workflow check',
    prepare: () =>
      replaceFile('.github/workflows/continuous-integration.yml', (content) =>
        content.replace('        run: yarn typecheck 2>&1 | tee continuous-integration-evidence/typecheck.log\n', ''),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:workflow']),
  });

  await proveFailure({
    expected: /Unit-test evidence upload is missing or weakened: failure-safe upload condition/,
    label: 'success-only unit-test evidence upload',
    prepare: () =>
      replaceFile('.github/workflows/continuous-integration.yml', (content) =>
        content.replace("if: ${{ always() && steps.unit_tests.outcome != 'skipped' }}", 'if: success()'),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:workflow']),
  });

  await proveFailure({
    expected: /fail-closed run shell|bash -eo pipefail/,
    label: 'pipeline failure masking',
    prepare: () =>
      replaceFile('.github/workflows/continuous-integration.yml', (content) =>
        content.replace('shell: bash -eo pipefail {0}', 'shell: bash -e {0}'),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:workflow']),
  });

  await proveFailure({
    expected: /Missing mandatory command|direct yarn install --immutable/,
    label: 'script-based continuous integration bootstrap',
    prepare: () =>
      replaceFile('.github/workflows/continuous-integration.yml', (content) =>
        content.replace('yarn install --immutable', 'yarn install:check'),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:workflow']),
  });

  await proveFailure({
    expected: /Both protected-base jobs must bootstrap with direct yarn install --immutable/,
    label: 'script-based adversarial bootstrap',
    prepare: () =>
      replaceFile('.github/workflows/adversarial-review.yml', (content) =>
        content.replaceAll('yarn install --immutable', 'yarn install:check'),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:adversarial-workflow']),
  });

  await proveFailure({
    env: {
      YARN_HTTP_TIMEOUT: '1000',
      YARN_NPM_REGISTRY_SERVER: 'http://127.0.0.1:9',
    },
    expected: /ECONNREFUSED|RequestError|fetch failed/,
    label: 'unavailable security audit service',
    run: (env) => runSandbox(yarnExecutable, ['security:audit'], { env }),
  });

  await proveFailure({
    expected: /Could not resolve|Failed to resolve/,
    label: 'browser bundle',
    prepare: () =>
      replaceFile('src/stories/game-hub/FloppyBird.stories.tsx', (content) =>
        content.replace(
          "from '../../components/games/GameCard';",
          "from '../../components/games/ci-missing-browser-module';",
        ),
      ),
    run: () => runSandbox(yarnExecutable, ['build-storybook']),
  });

  console.log('Continuous integration fail-closed proof passed for 23 representative failures.');
} catch (error) {
  runError = error;
} finally {
  if (worktreeCreated) {
    const cleanup = runRaw('git', ['worktree', 'remove', '--force', sandboxDirectory], {
      cwd: rootDirectory,
    });
    if (cleanup.status !== 0 && !runError) {
      runError = commandError('remove proof worktree', cleanup);
    }
  }
  await fs.rm(temporaryRoot, { force: true, recursive: true });
}

if (runError) {
  throw runError;
}

async function proveFreshBootstrap() {
  const statePath = sandboxPath('node_modules/.yarn-state.yml');

  try {
    await fs.access(statePath);
    throw new Error('Fresh proof worktree unexpectedly contained a Yarn node-modules state file.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const scriptedInstall = runSandbox(yarnExecutable, ['install:check']);
  if (scriptedInstall.error) throw scriptedInstall.error;
  const scriptedOutput = `${scriptedInstall.stdout}${scriptedInstall.stderr}`;
  if (scriptedInstall.status === 0) {
    throw new Error('Script-based dependency bootstrap unexpectedly succeeded without Yarn state.');
  }
  if (!/findPackageLocation|node_modules state file/.test(scriptedOutput)) {
    throw new Error(`Scripted bootstrap failed for an unexpected reason:\n${scriptedOutput.slice(-4000)}`);
  }

  runRequired('install proof dependencies immutably', yarnExecutable, ['install', '--immutable'], {
    env: {
      YARN_ENABLE_GLOBAL_CACHE: '0',
      // The real workflow install already performs registry hardening before this synthetic proof.
      YARN_ENABLE_HARDENED_MODE: '0',
    },
  });
  await fs.access(statePath);
  console.log('Verified direct immutable install bootstraps a fresh node-modules worktree.');
}

async function syncCurrentPolicySources() {
  for (const relativePath of [
    '.github/workflows/adversarial-review.yml',
    '.github/workflows/continuous-integration.yml',
    'package.json',
    'scripts/check-adversarial-workflow-policy.mjs',
    'scripts/check-test-integrity.mjs',
    'scripts/check-workflow-policy.mjs',
    'scripts/check-workflow-policy.test.mjs',
    'scripts/prove-ci-fail-closed.mjs',
    'scripts/test-discovery.mjs',
    'src/test/setup.ts',
    'vitest.config.ts',
    'yarn.lock',
  ]) {
    await fs.copyFile(path.join(rootDirectory, relativePath), sandboxPath(relativePath));
  }
}

async function proveCanonicalTestFailures() {
  await proveFailure({
    expected: /expected true to be false/,
    label: 'test assertion',
    prepare: () =>
      createProbeFile(
        'src/ci-failure-probe.test.ts',
        "import { expect, it } from 'vitest';\nit('fails deliberately', () => expect(true).toBe(false));\n",
      ),
    run: () => runPipedSandbox(yarnExecutable, ['test:ci'], 'continuous-integration-evidence/test.log'),
    verify: async ({ output }) => {
      assertOutputIncludes(output, 'src/ci-failure-probe.test.ts', 'test assertion');
      await assertCanonicalTestFailureEvidence();
    },
  });

  await proveFailure({
    expected: /Expected at least one test file under: packages\./,
    label: 'missing suite or no tests',
    prepare: () =>
      moveFiles(['packages/game-contract/src/index.test.ts', 'packages/game-contract/src/simulation.test.ts']),
    run: () => runSandbox(yarnExecutable, ['test:ci']),
  });

  for (const integrityProbe of [
    {
      expected: /contains a focused test\./,
      label: 'focused or exclusive test',
      source: "import { it } from 'vitest';\nit.only('must not be exclusive', () => {});\n",
    },
    {
      expected: /contains a skipped test\./,
      label: 'skipped test',
      source: "import { it } from 'vitest';\nit.skip('must not be skipped', () => {});\n",
    },
    {
      expected: /contains a todo test\./,
      label: 'todo test',
      source: "import { it } from 'vitest';\nit.todo('must not be todo');\n",
    },
    {
      expected: /contains a quarantined test\./,
      label: 'quarantined test',
      source: "import { it } from 'vitest';\n// quarantined pending repair\nit('must not be quarantined', () => {});\n",
    },
  ]) {
    await proveFailure({
      expected: integrityProbe.expected,
      label: integrityProbe.label,
      prepare: () => createProbeFile('src/ci-integrity-probe.test.ts', integrityProbe.source),
      run: () => runSandbox(yarnExecutable, ['test:ci']),
      verify: ({ output }) => assertOutputIncludes(output, 'src/ci-integrity-probe.test.ts', integrityProbe.label),
    });
  }

  await proveFailure({
    expected: /Test leaked global properties: __ciLeakedGlobal/,
    label: 'leaked global',
    prepare: () =>
      createProbeFile(
        'src/ci-global-leak-probe.test.ts',
        [
          "import { it } from 'vitest';",
          '',
          "it('leaks a global deliberately', () => {",
          "  Object.defineProperty(globalThis, '__ciLeakedGlobal', { configurable: true, value: true });",
          '});',
          '',
        ].join('\n'),
      ),
    run: () => runSandbox(yarnExecutable, ['test:ci']),
    verify: ({ output }) => assertOutputIncludes(output, 'src/ci-global-leak-probe.test.ts', 'leaked global'),
  });

  await proveFailure({
    expected: /Test timed out in 10000ms/,
    label: 'test timeout',
    prepare: () =>
      createProbeFile(
        'src/ci-timeout-probe.test.ts',
        [
          "import { it } from 'vitest';",
          '',
          "it('times out deliberately', async () => {",
          '  await new Promise(() => {});',
          '});',
          '',
        ].join('\n'),
      ),
    run: () => runSandbox(yarnExecutable, ['test:ci']),
    verify: ({ output }) => assertOutputIncludes(output, 'src/ci-timeout-probe.test.ts', 'test timeout'),
  });

  await proveFailure({
    expected: /Coverage for (?:branches|functions|lines|statements).*does not meet global threshold/,
    label: 'coverage regression',
    prepare: () => createProbeFile('src/ci-coverage-regression.ts', createUncoveredSource()),
    run: () => runSandbox(yarnExecutable, ['test:ci']),
    verify: ({ output }) =>
      assertOutputMatches(output, /\.\.\.regression\.ts\s+\|\s+0/, 'coverage regression probe file'),
  });

  console.log('Verified 9 canonical continuous-integration test failure and integrity proofs.');
}

async function proveFailure({ env = {}, expected, label, prepare = async () => undefined, run, verify }) {
  const restore = await prepare();

  try {
    const result = run(env);
    if (result.error) {
      throw result.error;
    }

    const output = `${result.stdout}${result.stderr}`;
    if (result.status === 0) {
      throw new Error(`${label} failure probe unexpectedly succeeded.`);
    }
    if (!expected.test(output)) {
      throw new Error(`${label} probe failed for an unexpected reason:\n${output.slice(-4000)}`);
    }
    await verify?.({ output, result });
    console.log(`Verified ${label} fails closed.`);
  } finally {
    await restore?.();
  }
}

async function createProbeFile(relativePath, content) {
  const filePath = sandboxPath(relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return () => fs.rm(filePath, { force: true });
}

async function replaceFile(relativePath, transform) {
  const filePath = sandboxPath(relativePath);
  const original = await fs.readFile(filePath, 'utf8');
  const replacement = transform(original);
  if (replacement === original) {
    throw new Error(`Failure probe did not change ${relativePath}.`);
  }
  await fs.writeFile(filePath, replacement);
  return () => fs.writeFile(filePath, original);
}

async function moveFile(fromRelativePath, toRelativePath) {
  const fromPath = sandboxPath(fromRelativePath);
  const toPath = sandboxPath(toRelativePath);
  await fs.rename(fromPath, toPath);
  return () => fs.rename(toPath, fromPath);
}

async function moveFiles(relativePaths) {
  const restores = [];

  for (const relativePath of relativePaths) {
    restores.push(await moveFile(relativePath, `${relativePath}.disabled`));
  }

  return async () => {
    for (const restore of restores.reverse()) {
      await restore();
    }
  };
}

function assertOutputIncludes(output, expected, label) {
  if (!output.includes(expected)) {
    throw new Error(`${label} probe did not identify ${expected}:\n${output.slice(-4000)}`);
  }
}

function assertOutputMatches(output, expected, label) {
  if (!expected.test(output)) {
    throw new Error(`${label} was not present in probe output:\n${output.slice(-4000)}`);
  }
}

function createUncoveredSource() {
  return `${Array.from(
    { length: 200 },
    (_, index) => `export function uncovered${index}(value: number): number { return value + ${index}; }`,
  ).join('\n')}\n`;
}

function sandboxPath(relativePath) {
  return path.join(sandboxDirectory, relativePath);
}

function runSandbox(command, args, options = {}) {
  return runRaw(command, args, { ...options, cwd: sandboxDirectory });
}

function runPipedSandbox(command, args, evidencePath) {
  return runRaw(
    'bash',
    ['-eo', 'pipefail', '-c', '"$@" 2>&1 | tee "$EVIDENCE_PATH"', 'ci-evidence', command, ...args],
    {
      cwd: sandboxDirectory,
      env: { EVIDENCE_PATH: sandboxPath(evidencePath) },
    },
  );
}

async function assertActionableLintEvidence(relativePath) {
  const output = await fs.readFile(sandboxPath(relativePath), 'utf8');
  if (!output.includes('scripts/ci-failure-probe.mjs')) {
    throw new Error('Retained lint evidence does not identify the failing file.');
  }
  if (!/\b1:7\s+error\s+.+\sno-unused-vars\b/.test(output)) {
    throw new Error(`Retained lint evidence is missing an actionable line, column, severity, and rule:\n${output}`);
  }
}

async function assertCanonicalTestFailureEvidence() {
  const testLog = await fs.readFile(sandboxPath('continuous-integration-evidence/test.log'), 'utf8');
  if (!testLog.includes('src/ci-failure-probe.test.ts') || !testLog.includes('expected true to be false')) {
    throw new Error(`Retained test diagnostics do not identify the failing assertion:\n${testLog.slice(-4000)}`);
  }

  const junit = await fs.readFile(sandboxPath('test-results/junit.xml'), 'utf8');
  if (!/<testsuites\b/.test(junit) || !/\bfailures="[1-9]\d*"/.test(junit)) {
    throw new Error('Retained JUnit evidence does not report the failing test.');
  }

  const coverageSummary = JSON.parse(await fs.readFile(sandboxPath('coverage/coverage-summary.json'), 'utf8'));
  if (!coverageSummary.total?.lines || typeof coverageSummary.total.lines.pct !== 'number') {
    throw new Error('Retained coverage summary is missing measured line coverage.');
  }

  const lcov = await fs.readFile(sandboxPath('coverage/lcov.info'), 'utf8');
  if (!lcov.includes('SF:')) {
    throw new Error('Retained LCOV evidence does not identify measured source files.');
  }
}

function runRequired(label, command, args, options = {}) {
  const result = runRaw(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw commandError(label, result);
  }
  return result;
}

function runRaw(command, args, { cwd = sandboxDirectory, env = {} } = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commandError(label, result) {
  return new Error(`${label} failed with status ${result.status}:\n${result.stdout}${result.stderr}`);
}
