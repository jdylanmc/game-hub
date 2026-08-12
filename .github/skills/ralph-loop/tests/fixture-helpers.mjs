import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkpointFilePath, leaseFilePath, readJsonIfExists, sleep } from '../scripts/ralph-runtime-state.mjs';
import { prepareWorktree, repositoryIdentity } from '../scripts/ralph-worktrees.mjs';

export const runnerScriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/run-ralph-loop.mjs',
);
export let scratchRoot = path.resolve('.ralph-test-work/runner');

export function setScratchRoot(relativePath) {
  scratchRoot = path.resolve(relativePath);
}

function command(commandName, args, cwd) {
  return execFileSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function gitCommand(cwd, ...args) {
  return command('git', args, cwd);
}

export function resetScratchRoot() {
  rmSync(scratchRoot, { force: true, recursive: true });
  mkdirSync(scratchRoot, { recursive: true });
}

export function createRepository(name) {
  const root = path.join(scratchRoot, name);
  const remote = path.join(scratchRoot, `${name}.git`);
  mkdirSync(root, { recursive: true });
  command('git', ['init', '--bare', remote], scratchRoot);
  command('git', ['init', '-b', 'main'], root);
  command('git', ['config', 'user.email', 'ralph-test@example.invalid'], root);
  command('git', ['config', 'user.name', 'Ralph Test'], root);
  writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  command('git', ['add', '.'], root);
  command('git', ['commit', '-m', 'initial'], root);
  command('git', ['remote', 'add', 'origin', remote], root);
  command('git', ['push', '-u', 'origin', 'main'], root);
  const githubUrl = 'https://github.com/jdylanmc/game-hub.git';
  command('git', ['config', `url.${pathToFileURL(remote).href}.insteadOf`, githubUrl], root);
  command('git', ['remote', 'set-url', 'origin', githubUrl], root);
  return { githubUrl, remote, root };
}

function writeRepositoryFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function defaultPlan({ branchName, issueNumber }) {
  return {
    repoNameWithOwner: 'jdylanmc/game-hub',
    issueNumber,
    issueTitle: `Fixture issue ${issueNumber}`,
    issueUrl: `https://github.com/jdylanmc/game-hub/issues/${issueNumber}`,
    branchName,
    baseBranch: 'main',
    continuousByBestJudgment: true,
    publication: {
      requiredStatusChecks: ['Continuous integration'],
      adversarialStatusChecks: [],
    },
    orchestration: {
      priority: 1,
      dependencies: [],
      changeScopes: ['docs/memories'],
    },
    stories: [
      {
        id: 'US-001',
        title: 'Complete the fixture story',
        description: 'Synthetic story used to exercise the Ralph runner.',
        acceptanceCriteria: ['A fake Copilot process commits the story result.'],
        priority: 1,
        passes: false,
        notes: '',
      },
    ],
  };
}

export function createRalphFixture(name, { issueNumber = 30, planPatch = {}, slug = 'fixture-runner' } = {}) {
  const branchName = `ralph/issue-${issueNumber}-${slug}`;
  const { remote, root } = createRepository(name);
  const prepared = prepareWorktree({
    repoRoot: root,
    issueNumber,
    branchName,
  });
  const worktreePath = prepared.worktreePath;
  const memoryDir = `docs/memories/${issueNumber}-${slug}`;
  const plan = {
    ...defaultPlan({ branchName, issueNumber }),
    ...planPatch,
    publication: {
      ...defaultPlan({ branchName, issueNumber }).publication,
      ...(planPatch.publication ?? {}),
    },
    orchestration: {
      ...defaultPlan({ branchName, issueNumber }).orchestration,
      ...(planPatch.orchestration ?? {}),
    },
    stories: planPatch.stories ?? defaultPlan({ branchName, issueNumber }).stories,
  };

  writeRepositoryFile(worktreePath, '.gitignore', 'docs/memories/**/iterations/*.log\n');
  writeRepositoryFile(worktreePath, 'AGENTS.md', 'Fixture guide.\n');
  writeRepositoryFile(worktreePath, 'docs/architecture.md', 'Fixture architecture.\n');
  writeRepositoryFile(worktreePath, 'docs/ralph-loop.md', 'Fixture Ralph docs.\n');
  writeRepositoryFile(worktreePath, '.github/skills/ralph-loop/references/iteration-prompt.md', 'Fixture prompt.\n');
  writeRepositoryFile(worktreePath, `${memoryDir}/issue.md`, `# Issue ${issueNumber}\n`);
  writeRepositoryFile(worktreePath, `${memoryDir}/progress.md`, '# Progress\n\n## Codebase Patterns\n');
  writeRepositoryFile(worktreePath, `${memoryDir}/plan.json`, `${JSON.stringify(plan, null, 2)}\n`);
  command('git', ['add', '.'], worktreePath);
  command('git', ['commit', '-m', 'seed ralph fixture'], worktreePath);

  const { commonDir } = repositoryIdentity(worktreePath);
  const statePath = path.join(scratchRoot, `${name}-gh-state.json`);
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        adversarialCheckName: 'Adversarial review',
        adversarialState: 'missing',
        baseBranch: 'main',
        body: `<!-- ralph-issue:${issueNumber} -->\n\nTracks #${issueNumber}.\n`,
        branchName,
        checkState: 'success',
        issueNumber,
        issueTitle: plan.issueTitle,
        issueUrl: plan.issueUrl,
        owner: 'jdylanmc',
        prExists: false,
        prNumber: 101,
        repoNameWithOwner: 'jdylanmc/game-hub',
      },
      null,
      2,
    )}\n`,
  );

  const binDir = path.join(scratchRoot, `${name}-bin`);
  mkdirSync(binDir, { recursive: true });
  const fakeGhPath = path.join(binDir, 'gh');
  const fakeCopilotPath = path.join(binDir, 'copilot');
  writeFileSync(
    fakeGhPath,
    `#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const statePath = process.env.FAKE_GH_STATE_PATH;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const cwd = process.cwd();
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const check = (name, stateValue) => {
  if (!stateValue || stateValue === 'missing') return null;
  if (stateValue === 'success') return { name, conclusion: 'SUCCESS' };
  if (stateValue === 'pending') return { name, status: 'IN_PROGRESS' };
  if (stateValue === 'failure') return { name, conclusion: 'FAILURE' };
  if (stateValue === 'cancelled') return { name, conclusion: 'CANCELLED' };
  if (stateValue === 'neutral') return { name, conclusion: 'NEUTRAL' };
  if (stateValue === 'skipped') return { name, conclusion: 'SKIPPED' };
  return { name, status: 'EXPECTED' };
};
const checks = () => {
  const result = [];
  const required = check('Continuous integration', state.checkState);
  if (required) result.push(required);
  if (state.adversarialCheckName) {
    const adversarial = check(state.adversarialCheckName, state.adversarialState);
    if (adversarial) result.push(adversarial);
  }
  return result;
};
const currentHead = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const prRecord = () => ({
  number: state.prNumber,
  url: \`https://github.com/\${state.repoNameWithOwner}/pull/\${state.prNumber}\`,
  body: state.body,
  state: 'OPEN',
  isDraft: true,
  headRefName: state.branchName,
  baseRefName: state.baseBranch,
  headRefOid: currentHead(),
  statusCheckRollup: checks(),
});
const writeState = (nextState) => {
  fs.writeFileSync(statePath, \`\${JSON.stringify(nextState, null, 2)}\\n\`);
};
if (args[0] === 'api' && args[1] === 'user') {
  process.stdout.write(\`\${state.owner}\\n\`);
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'token') {
  process.stdout.write('test-token\\n');
  process.exit(0);
}
if (args[0] === 'repo' && args[1] === 'view') {
  process.stdout.write(\`\${JSON.stringify({ nameWithOwner: state.repoNameWithOwner, defaultBranchRef: { name: state.baseBranch } })}\\n\`);
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'view') {
  process.stdout.write(\`\${JSON.stringify({ number: state.issueNumber, title: state.issueTitle, url: state.issueUrl, state: 'OPEN' })}\\n\`);
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'list') {
  const branch = option('--head');
  const payload = state.prExists && (!branch || branch === state.branchName) ? [prRecord()] : [];
  process.stdout.write(\`\${JSON.stringify(payload)}\\n\`);
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'view') {
  if (!state.prExists) {
    process.stderr.write('no pull request\\n');
    process.exit(1);
  }
  process.stdout.write(\`\${JSON.stringify(prRecord())}\\n\`);
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  const nextState = {
    ...state,
    baseBranch: option('--base') || state.baseBranch,
    body: option('--body') || state.body,
    branchName: option('--head') || state.branchName,
    prExists: true,
  };
  writeState(nextState);
  process.stdout.write(\`https://github.com/\${state.repoNameWithOwner}/pull/\${state.prNumber}\\n\`);
  process.exit(0);
}
process.stderr.write(\`Unsupported fake gh call: \${args.join(' ')}\\n\`);
process.exit(2);
`,
  );
  writeFileSync(
    fakeCopilotPath,
    `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const scenario = process.env.FAKE_COPILOT_SCENARIO || 'silent-sleep';
const sleepMs = Number(process.env.FAKE_COPILOT_SLEEP_MS || 4000);
const memoryDir = process.env.MEMORY_DIR;
const repoRoot = process.cwd();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (scenario === 'silent-sleep') {
    await sleep(sleepMs);
    return;
  }

  if (scenario === 'spawn-descendant-and-sleep') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    if (process.env.FAKE_CHILD_PID_PATH) {
      fs.writeFileSync(process.env.FAKE_CHILD_PID_PATH, \`\${child.pid}\\n\`);
    }
    await sleep(sleepMs);
    return;
  }

  if (scenario === 'complete') {
    const planPath = path.join(repoRoot, memoryDir, 'plan.json');
    const progressPath = path.join(repoRoot, memoryDir, 'progress.md');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    plan.stories = plan.stories.map((story, index) =>
      index === 0 ? { ...story, passes: true, notes: 'Completed by the fake Copilot runner.' } : story,
    );
    fs.writeFileSync(planPath, \`\${JSON.stringify(plan, null, 2)}\\n\`);
    fs.appendFileSync(
      progressPath,
      '\\n- 2026-08-11 US-001\\n  - Completed by the fake Copilot runner.\\n  - Checks run: synthetic.\\n',
    );
    fs.writeFileSync(path.join(repoRoot, 'fake-implementation.txt'), 'completed\\n');
    execFileSync('git', ['add', '.'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'fake story completion'], { cwd: repoRoot, stdio: 'ignore' });
    process.stdout.write('<promise>COMPLETE</promise>\\n');
    return;
  }

  throw new Error(\`Unsupported fake Copilot scenario: \${scenario}\`);
}

main().catch((error) => {
  process.stderr.write(\`\${error.message}\\n\`);
  process.exit(1);
});
`,
  );
  chmodSync(fakeGhPath, 0o755);
  chmodSync(fakeCopilotPath, 0o755);

  return {
    baseRoot: root,
    binDir,
    branchName,
    checkpointPath: checkpointFilePath(commonDir, issueNumber),
    commonDir,
    ghStatePath: statePath,
    issueNumber,
    leasePath: leaseFilePath(commonDir, issueNumber),
    memoryDir,
    remote,
    worktreePath,
  };
}

export function readGhState(fixture) {
  return JSON.parse(readFileSync(fixture.ghStatePath, 'utf8'));
}

export function writeGhState(fixture, patch) {
  writeFileSync(fixture.ghStatePath, `${JSON.stringify({ ...readGhState(fixture), ...patch }, null, 2)}\n`);
}

export function spawnRunner(fixture, args = [], environment = {}) {
  return spawn(process.execPath, [runnerScriptPath, '--memory-dir', fixture.memoryDir, ...args], {
    cwd: fixture.worktreePath,
    env: {
      ...process.env,
      GH_TOKEN: 'test-token',
      PATH: `${fixture.binDir}:${process.env.PATH}`,
      FAKE_COPILOT_SCENARIO: 'silent-sleep',
      FAKE_COPILOT_SLEEP_MS: '4000',
      FAKE_GH_STATE_PATH: fixture.ghStatePath,
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function waitForFile(filePath, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      return;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

export async function waitForLease(fixture, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lease = readJsonIfExists(fixture.leasePath);
    if (lease) return lease;
    await sleep(50);
  }
  throw new Error('Timed out waiting for the Ralph lease.');
}

export function readLease(fixture) {
  return readJsonIfExists(fixture.leasePath);
}

export function readCheckpoint(fixture) {
  return readJsonIfExists(fixture.checkpointPath);
}

export async function collectOutput(child) {
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode, stderr, stdout };
  }
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { ...result, stderr, stdout };
}
