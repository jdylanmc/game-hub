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

  await proveFailure({
    expected: /expected true to be false|AssertionError/,
    label: 'tests',
    prepare: () =>
      createProbeFile(
        'src/ci-failure-probe.test.ts',
        "import { expect, it } from 'vitest';\nit('fails deliberately', () => expect(true).toBe(false));\n",
      ),
    run: () => runSandbox(yarnExecutable, ['test:coverage']),
  });

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
    expected: /Missing deterministic security workflow invariant/,
    label: 'missing deterministic secret detection',
    prepare: () =>
      replaceFile('.github/workflows/continuous-integration.yml', (content) =>
        content.replace('          yarn security:secrets \\\n', '          echo security-scan-removed \\\n'),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:workflow']),
  });

  await proveFailure({
    expected: /does not aggregate every deterministic gate|Missing deterministic security workflow invariant/,
    label: 'masked deterministic security result',
    prepare: () =>
      replaceFile('.github/workflows/continuous-integration.yml', (content) =>
        content.replace('test "$SECURITY_RESULT" = success', 'echo "$SECURITY_RESULT"'),
      ),
    run: () => runSandbox(yarnExecutable, ['policy:workflow']),
  });

  await proveFailure({
    expected: /no reviewed deterministic image scanner is configured/i,
    label: 'unsupported container surface',
    prepare: async () => {
      const restoreFile = await createProbeFile('Dockerfile', 'FROM scratch\n');
      runRequired('stage container proof', 'git', ['add', 'Dockerfile']);
      return async () => {
        runRequired('unstage container proof', 'git', ['reset', '--', 'Dockerfile']);
        await restoreFile();
      };
    },
    run: () => runSandbox(yarnExecutable, ['security:containers']),
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

  console.log('Continuous integration fail-closed proof passed for 17 representative failures.');
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
    '.github/skills/ralph-loop/references/iteration-prompt.md',
    '.github/workflows/adversarial-review.yml',
    '.github/workflows/continuous-integration.yml',
    'config/adversarial-agents/agents-config.json',
    'config/adversarial-agents/gilfoyle-security-architect/context.json',
    'config/adversarial-agents/gilfoyle-security-architect/deterministic-evidence.json',
    'eslint.config.js',
    'games/floppy-bird/src/index.test.ts',
    'games/neon-drift/src/index.ts',
    'package.json',
    'packages/game-contract/src/index.test.ts',
    'scripts/build-deterministic-security-evidence.ts',
    'scripts/check-adversarial-workflow-policy.mjs',
    'scripts/check-adversarial-policy.mjs',
    'scripts/check-bicep-security.ts',
    'scripts/check-container-security-surface.ts',
    'scripts/check-lint-scope.mjs',
    'scripts/check-lint-suppressions.mjs',
    'scripts/check-secret-exposure.ts',
    'scripts/check-workflow-policy.mjs',
    'scripts/collect-adversarial-context.ts',
    'scripts/prove-ci-fail-closed.mjs',
    'scripts/prove-lint-behavior.mjs',
    'scripts/tsconfig.json',
    'scripts/validate-gilfoyle-security-contract.ts',
    'src/components/Link.tsx',
    'tailwind.config.ts',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'yarn.lock',
  ]) {
    await fs.copyFile(path.join(rootDirectory, relativePath), sandboxPath(relativePath));
  }
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
