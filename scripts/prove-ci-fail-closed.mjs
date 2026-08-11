import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'game-hub-ci-proof-'));
const sandboxDirectory = path.join(temporaryRoot, 'repository');
const yarnExecutable = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
let worktreeCreated = false;
let runError;

try {
  runRequired('create detached proof worktree', 'git', ['worktree', 'add', '--detach', sandboxDirectory, 'HEAD'], {
    cwd: rootDirectory,
  });
  worktreeCreated = true;
  runRequired('install proof dependencies immutably', yarnExecutable, ['install', '--immutable']);

  await proveFailure({
    expected: /Code style issues found|scripts\/ci-failure-probe\.mjs/,
    label: 'formatting',
    prepare: () => createProbeFile('scripts/ci-failure-probe.mjs', 'const badlyFormatted={value:"broken"}\n'),
    run: () => runSandbox(yarnExecutable, ['format:check']),
  });

  await proveFailure({
    expected: /no-unused-vars/,
    label: 'lint',
    prepare: () => createProbeFile('scripts/ci-failure-probe.mjs', 'const unused = 1;\n'),
    run: () => runSandbox(yarnExecutable, ['lint']),
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

  console.log('Continuous integration fail-closed proof passed for 11 representative failures.');
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

async function proveFailure({ env = {}, expected, label, prepare = async () => undefined, run }) {
  const restore = await prepare();
  let result;

  try {
    result = run(env);
  } finally {
    await restore?.();
  }

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

  console.log(`Verified ${label} fails closed.`);
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
