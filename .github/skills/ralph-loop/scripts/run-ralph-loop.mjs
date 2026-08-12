#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIsolatedGitHubEnvironment, verifyGitHubIdentity } from './ralph-github-auth.mjs';
import { collectLoopSnapshot } from './ralph-status.mjs';
import {
  acquireLock,
  archiveRuntimeState,
  assessRecovery,
  DEFAULT_HEARTBEAT_SECONDS,
  DEFAULT_ITERATION_DEADLINE_MINUTES,
  DEFAULT_STALE_AFTER_SECONDS,
  evaluateLeaseState,
  leaseFilePath,
  checkpointFilePath,
  parseGitStatusPorcelain,
  processAlive,
  RalphRuntimeState,
  readJsonIfExists,
  releaseLocks,
  sleep,
  stableLockKey,
} from './ralph-runtime-state.mjs';
import { loadPlan, repositoryIdentity } from './ralph-worktrees.mjs';

const COMPLETE_MARKER = '<promise>COMPLETE</promise>';
const LOCK_STALE_AFTER_MULTIPLIER = 1000;
const MAX_BUFFER = 20 * 1024 * 1024;

function usage() {
  return `Usage:
  run-ralph-loop.sh --memory-dir <path> [--max-iterations <count>] [--iteration-deadline-minutes <minutes>]
  run-ralph-loop.sh --memory-dir <path> --continuous [--iteration-deadline-minutes <minutes>]

Options:
  --memory-dir                   Issue memory directory under docs/memories.
  --max-iterations               Maximum fresh Copilot contexts. Defaults to 10.
  --continuous                   Continue until completion or a safety stop.
  --iteration-deadline-minutes   Hard per-iteration deadline. Defaults to 90 minutes.
  --dry-run                      Validate inputs, runtime recovery, and print the Copilot command.
  --help                         Show this help.
`;
}

function parseArgs(argv) {
  const options = {
    continuous: false,
    dryRun: false,
    heartbeatSeconds: Number(process.env.RALPH_HEARTBEAT_SECONDS ?? DEFAULT_HEARTBEAT_SECONDS),
    iterationDeadlineMinutes: Number(
      process.env.RALPH_ITERATION_DEADLINE_MINUTES ?? DEFAULT_ITERATION_DEADLINE_MINUTES,
    ),
    leaseStaleSeconds: Number(process.env.RALPH_LEASE_STALE_SECONDS ?? DEFAULT_STALE_AFTER_SECONDS),
    maxIterations: 10,
    memoryDir: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--memory-dir':
        options.memoryDir = argv[index + 1] ?? '';
        index += 1;
        break;
      case '--max-iterations':
        options.maxIterations = Number(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--continuous':
        options.continuous = true;
        break;
      case '--iteration-deadline-minutes':
        options.iterationDeadlineMinutes = Number(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument '${argument}'.`);
    }
  }

  if (options.help) return options;
  if (!options.memoryDir) {
    throw new Error('--memory-dir is required.');
  }
  if (!Number.isInteger(options.maxIterations) || options.maxIterations < 1) {
    throw new Error('--max-iterations must be a positive integer.');
  }
  if (!Number.isFinite(options.iterationDeadlineMinutes) || options.iterationDeadlineMinutes <= 0) {
    throw new Error('--iteration-deadline-minutes must be a positive number.');
  }
  if (!Number.isFinite(options.heartbeatSeconds) || options.heartbeatSeconds <= 0) {
    throw new Error('RALPH_HEARTBEAT_SECONDS must be a positive number when set.');
  }
  if (!Number.isFinite(options.leaseStaleSeconds) || options.leaseStaleSeconds <= 0) {
    throw new Error('RALPH_LEASE_STALE_SECONDS must be a positive number when set.');
  }
  return options;
}

function execText(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function execJson(command, args, options = {}) {
  const output = execText(command, args, options);
  return output ? JSON.parse(output) : null;
}

function git(cwd, ...args) {
  return execText('git', args, { cwd });
}

function gh(cwd, env, ...args) {
  return execText('gh', args, { cwd, env });
}

function remoteNameFromUrl(remoteUrl) {
  if (remoteUrl.startsWith('git@github.com:')) {
    return remoteUrl.slice('git@github.com:'.length).replace(/\.git$/, '');
  }
  if (remoteUrl.startsWith('ssh://git@github.com/')) {
    return remoteUrl.slice('ssh://git@github.com/'.length).replace(/\.git$/, '');
  }
  if (remoteUrl.startsWith('https://github.com/')) {
    return remoteUrl.slice('https://github.com/'.length).replace(/\.git$/, '');
  }
  throw new Error('The origin remote must be a supported GitHub SSH or HTTPS URL.');
}

function validateStory(story) {
  if (!story || typeof story !== 'object') return false;
  return (
    typeof story.id === 'string' &&
    story.id.length > 0 &&
    typeof story.title === 'string' &&
    story.title.length > 0 &&
    typeof story.description === 'string' &&
    story.description.length > 0 &&
    Array.isArray(story.acceptanceCriteria) &&
    story.acceptanceCriteria.length > 0 &&
    story.acceptanceCriteria.every((criterion) => typeof criterion === 'string' && criterion.length > 0) &&
    Number.isFinite(story.priority) &&
    typeof story.passes === 'boolean' &&
    typeof story.notes === 'string' &&
    (story.dependencies === undefined ||
      (Array.isArray(story.dependencies) &&
        story.dependencies.every((dependency) => typeof dependency === 'string' && dependency.length > 0)))
  );
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('plan.json must contain an object.');
  }
  if (typeof plan.repoNameWithOwner !== 'string' || !plan.repoNameWithOwner) {
    throw new Error('plan.json must contain repoNameWithOwner.');
  }
  if (!Number.isInteger(plan.issueNumber) || plan.issueNumber < 1) {
    throw new Error('plan.json must contain a positive integer issueNumber.');
  }
  if (typeof plan.issueTitle !== 'string' || !plan.issueTitle) {
    throw new Error('plan.json must contain issueTitle.');
  }
  if (typeof plan.issueUrl !== 'string' || !plan.issueUrl) {
    throw new Error('plan.json must contain issueUrl.');
  }
  if (typeof plan.branchName !== 'string' || !plan.branchName) {
    throw new Error('plan.json must contain branchName.');
  }
  if (typeof plan.baseBranch !== 'string' || !plan.baseBranch) {
    throw new Error('plan.json must contain baseBranch.');
  }
  if (typeof plan.continuousByBestJudgment !== 'boolean') {
    throw new Error('plan.json must contain continuousByBestJudgment.');
  }
  const orchestration = plan.orchestration ?? {};
  if (
    typeof orchestration !== 'object' ||
    !Number.isFinite(orchestration.priority ?? 100) ||
    !Array.isArray(orchestration.dependencies ?? []) ||
    !(orchestration.dependencies ?? []).every((dependency) => Number.isInteger(dependency) && dependency > 0) ||
    !Array.isArray(orchestration.changeScopes ?? ['.']) ||
    (orchestration.changeScopes ?? ['.']).length === 0 ||
    !(orchestration.changeScopes ?? ['.']).every((scope) => typeof scope === 'string' && scope.length > 0)
  ) {
    throw new Error('plan.json contains an invalid orchestration block.');
  }
  const publication = plan.publication ?? {};
  if (
    typeof publication !== 'object' ||
    (publication.requiredStatusChecks !== undefined &&
      (!Array.isArray(publication.requiredStatusChecks) ||
        publication.requiredStatusChecks.length === 0 ||
        !publication.requiredStatusChecks.every((entry) => typeof entry === 'string' && entry.length > 0))) ||
    (publication.adversarialStatusChecks !== undefined &&
      (!Array.isArray(publication.adversarialStatusChecks) ||
        !publication.adversarialStatusChecks.every((entry) => typeof entry === 'string' && entry.length > 0)))
  ) {
    throw new Error('plan.json contains an invalid publication block.');
  }
  if (!Array.isArray(plan.stories) || plan.stories.length === 0 || !plan.stories.every(validateStory)) {
    throw new Error('plan.json must contain at least one valid story.');
  }
  const storyIds = plan.stories.map((story) => story.id);
  if (storyIds.length !== new Set(storyIds).size) {
    throw new Error('plan.json story ids must be unique.');
  }
}

function assertPlanIdentity(plan, { baseBranch, branchName, issueNumber, repoNameWithOwner }) {
  if (plan.repoNameWithOwner !== repoNameWithOwner) {
    throw new Error('The plan repository identity changed during the run.');
  }
  if (plan.issueNumber !== issueNumber) {
    throw new Error('The plan issue identity changed during the run.');
  }
  if (plan.branchName !== branchName) {
    throw new Error('The plan branch identity changed during the run.');
  }
  if (plan.baseBranch !== baseBranch) {
    throw new Error('The plan base branch changed during the run.');
  }
}

function resolveMemoryDirectory(repoRoot, memoryDir) {
  if (path.isAbsolute(memoryDir)) {
    throw new Error('--memory-dir must be repository-relative.');
  }
  const resolved = path.resolve(repoRoot, memoryDir);
  const memoryRoot = path.resolve(repoRoot, 'docs', 'memories');
  const realMemoryRoot = existsSync(memoryRoot) ? realpathSync(memoryRoot) : memoryRoot;
  if (
    resolved !== memoryRoot &&
    !resolved.startsWith(`${memoryRoot}${path.sep}`) &&
    !resolved.startsWith(`${realMemoryRoot}${path.sep}`)
  ) {
    throw new Error('--memory-dir must be under docs/memories/.');
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`Missing memory directory ${memoryDir}.`);
  }
  return resolved;
}

function resolveMemoryFiles(repoRoot, memoryDir) {
  const resolvedMemoryDir = resolveMemoryDirectory(repoRoot, memoryDir);
  const planFile = path.join(resolvedMemoryDir, 'plan.json');
  const issueFile = path.join(resolvedMemoryDir, 'issue.md');
  const progressFile = path.join(resolvedMemoryDir, 'progress.md');
  const iterationsDir = path.join(resolvedMemoryDir, 'iterations');
  const promptFile = path.join(repoRoot, '.github', 'skills', 'ralph-loop', 'references', 'iteration-prompt.md');

  for (const filePath of [planFile, issueFile, progressFile, promptFile]) {
    if (!existsSync(filePath)) {
      throw new Error(`Missing ${path.relative(repoRoot, filePath)}.`);
    }
  }

  return {
    issueFile,
    iterationsDir,
    planFile,
    progressFile,
    promptFile,
    relativeMemoryDir: path.relative(repoRoot, resolvedMemoryDir).replaceAll(path.sep, '/'),
    resolvedMemoryDir,
  };
}

function remoteBranchExists(repoRoot, branchName) {
  try {
    execText('git', ['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${branchName}`], {
      cwd: repoRoot,
    });
    return true;
  } catch {
    return false;
  }
}

function fetchAndVerifyRemoteState(repoRoot, { baseBranch, branchName }) {
  execText('git', ['fetch', '--quiet', 'origin', `${baseBranch}:refs/remotes/origin/${baseBranch}`], { cwd: repoRoot });
  if (!remoteBranchExists(repoRoot, branchName)) return;
  execText('git', ['fetch', '--quiet', 'origin', `${branchName}:refs/remotes/origin/${branchName}`], { cwd: repoRoot });
  try {
    execText('git', ['merge-base', '--is-ancestor', `origin/${branchName}`, 'HEAD'], { cwd: repoRoot });
  } catch {
    throw new Error(`The local branch is behind or diverged from origin/${branchName}. Reconcile it manually.`);
  }
}

function loadPullRequest({ baseBranch, branchName, cwd, githubEnvironment, issueNumber, repoNameWithOwner }) {
  const pullRequests = execJson(
    'gh',
    ['pr', 'list', '--repo', repoNameWithOwner, '--head', branchName, '--state', 'all', '--json', 'number'],
    { cwd, env: githubEnvironment },
  );

  if (pullRequests.length > 1) {
    throw new Error(`Multiple pull requests use branch ${branchName}.`);
  }
  if (pullRequests.length === 0) {
    return null;
  }

  const pullRequest = execJson(
    'gh',
    [
      'pr',
      'view',
      String(pullRequests[0].number),
      '--repo',
      repoNameWithOwner,
      '--json',
      'number,url,body,state,isDraft,headRefName,baseRefName,headRefOid,statusCheckRollup',
    ],
    { cwd, env: githubEnvironment },
  );

  if (pullRequest.state !== 'OPEN') {
    throw new Error(`Pull request #${pullRequest.number} is not open.`);
  }
  if (!pullRequest.isDraft) {
    throw new Error(`Pull request #${pullRequest.number} is not a draft. A human must decide how to proceed.`);
  }
  if (pullRequest.headRefName !== branchName) {
    throw new Error(`Pull request #${pullRequest.number} uses an unexpected head branch.`);
  }
  if (pullRequest.baseRefName !== baseBranch) {
    throw new Error(`Pull request #${pullRequest.number} uses an unexpected base branch.`);
  }
  const body = pullRequest.body ?? '';
  if (!body.includes(`<!-- ralph-issue:${issueNumber} -->`) && !body.includes(`Tracks #${issueNumber}.`)) {
    throw new Error(`Pull request #${pullRequest.number} is not bound to issue #${issueNumber}.`);
  }

  return pullRequest;
}

function createPullRequest({
  baseBranch,
  branchName,
  cwd,
  githubEnvironment,
  issueNumber,
  issueTitle,
  repoNameWithOwner,
}) {
  try {
    const url = gh(
      cwd,
      githubEnvironment,
      'pr',
      'create',
      '--repo',
      repoNameWithOwner,
      '--draft',
      '--base',
      baseBranch,
      '--head',
      branchName,
      '--title',
      issueTitle,
      '--body',
      `<!-- ralph-issue:${issueNumber} -->

Tracks #${issueNumber}.

This draft pull request is maintained by the local Ralph Loop. A human must review and merge it.`,
    );
    return url;
  } catch {
    throw new Error(
      'The branch was pushed, but draft pull request creation failed. Rerun to reconcile the partial publication.',
    );
  }
}

function ensureWorkspaceAgentGuides(repoRoot) {
  for (const workspaceRoot of ['games', 'packages']) {
    const absoluteWorkspaceRoot = path.join(repoRoot, workspaceRoot);
    if (!existsSync(absoluteWorkspaceRoot)) continue;
    for (const entry of readdirSync(absoluteWorkspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspaceDirectory = path.join(absoluteWorkspaceRoot, entry.name);
      const packagePath = path.join(workspaceDirectory, 'package.json');
      if (existsSync(packagePath) && !existsSync(path.join(workspaceDirectory, 'AGENTS.md'))) {
        throw new Error(`Workspace ${path.relative(repoRoot, workspaceDirectory)} is missing AGENTS.md.`);
      }
    }
  }
}

function ensureIterationLogsIgnored(repoRoot, iterationsDir) {
  mkdirSync(iterationsDir, { recursive: true });
  const probePath = path.join(iterationsDir, '.ralph-log-test.log');
  try {
    execText('git', ['check-ignore', '-q', probePath], { cwd: repoRoot });
  } catch {
    throw new Error(`Iteration logs under ${path.relative(repoRoot, iterationsDir)} are not ignored by Git.`);
  }
}

function currentHead(repoRoot) {
  return git(repoRoot, 'rev-parse', 'HEAD');
}

function worktreeDirtyStatus(repoRoot) {
  const statusOutput = git(repoRoot, 'status', '--porcelain');
  return {
    dirty: Boolean(statusOutput),
    files: parseGitStatusPorcelain(statusOutput),
    statusOutput,
  };
}

function relativePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function nextLogFile(iterationsDir) {
  let sequence = 1;
  while (existsSync(path.join(iterationsDir, `${String(sequence).padStart(4, '0')}.log`))) {
    sequence += 1;
  }
  return path.join(iterationsDir, `${String(sequence).padStart(4, '0')}.log`);
}

function buildCopilotCommand(repoRoot, relativeMemoryDir) {
  return [
    'copilot',
    '-C',
    repoRoot,
    '--prompt',
    `Run one Ralph Loop iteration. MEMORY_DIR=${relativeMemoryDir}. Read and follow .github/skills/ralph-loop/references/iteration-prompt.md.`,
    '--allow-all-tools',
    '--allow-all-urls',
    '--no-ask-user',
    '--no-remote',
    '--no-remote-export',
    '--silent',
    '--stream',
    'off',
  ];
}

async function terminateChildProcessGroup(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null || !processAlive(child.pid)) {
      return;
    }
    await sleep(100);
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Ignore already-exited process groups.
  }
}

async function runChildProcess({ command, cwd, deadlineAt, environment, onDeadline, onSignal, runtimeState }) {
  const child = spawn(command[0], command.slice(1), {
    cwd,
    detached: true,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  runtimeState.updateLease({
    childPid: child.pid ?? null,
  });

  const writeChunk = (chunk) => {
    if (!chunk) return;
    process.stdout.write(chunk);
  };
  const writeErrorChunk = (chunk) => {
    if (!chunk) return;
    process.stderr.write(chunk);
  };

  child.stdout?.on('data', (chunk) => {
    runtimeState.logStream.write(chunk);
    writeChunk(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    runtimeState.logStream.write(chunk);
    writeErrorChunk(chunk);
  });

  while (true) {
    const race = await Promise.race([exitPromise, sleep(250).then(() => null)]);
    if (race) {
      return { child, result: race, stopReason: null };
    }
    if (onSignal()) {
      await terminateChildProcessGroup(child);
      await exitPromise.catch(() => null);
      return {
        child,
        result: { code: child.exitCode, signal: child.signalCode },
        stopReason: 'cancelled',
      };
    }
    if (Date.now() >= deadlineAt.getTime()) {
      await terminateChildProcessGroup(child);
      await exitPromise.catch(() => null);
      onDeadline();
      return {
        child,
        result: { code: child.exitCode, signal: child.signalCode },
        stopReason: 'timed-out',
      };
    }
  }
}

function checkpointFromPlan(plan, patch = {}) {
  const passedStoryIds = plan.stories.filter((story) => story.passes).map((story) => story.id);
  return {
    plan: {
      allStoriesPassed: passedStoryIds.length === plan.stories.length,
      nextStoryId:
        [...plan.stories]
          .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
          .find(
            (story) =>
              !story.passes && (story.dependencies ?? []).every((dependency) => passedStoryIds.includes(dependency)),
          )?.id ?? null,
      passedStoryIds,
      totalStories: plan.stories.length,
    },
    ...patch,
  };
}

async function waitForCheckOutcome({ deadlineAt, githubEnvironment, loop, repoRoot, runtimeState, staleAfterMs }) {
  const missingChecksGraceUntil = Date.now() + 60_000;
  runtimeState.updateLease({ childPid: null, phase: 'check-wait' });
  while (true) {
    const snapshot = collectLoopSnapshot(loop, { staleAfterMs });
    runtimeState.updateCheckpoint({
      checkState: {
        adversarial: snapshot.adversarialState,
        required: snapshot.ciState,
      },
      nextResumableAction: snapshot.nextAction,
      phase: 'check-wait',
      pullRequest: snapshot.pullRequestNumber
        ? {
            headSha: snapshot.pullRequestHeadSha,
            number: snapshot.pullRequestNumber,
            state: snapshot.pullRequestState,
            url: snapshot.pullRequestUrl,
          }
        : null,
    });

    if (Date.now() >= deadlineAt.getTime()) {
      runtimeState.stopLease({
        lastKnownHead: snapshot.localCommit,
        outcome: 'timed-out',
        reason: 'Iteration timed out while waiting for pull-request checks.',
      });
      return {
        ...snapshot,
        nextAction: 'Inspect the pending exact-head checks, then resume from the last verified checkpoint.',
        status: 'timed-out',
      };
    }
    const exactHeadPublished =
      snapshot.localCommit &&
      snapshot.remoteCommit &&
      snapshot.localCommit === snapshot.remoteCommit &&
      snapshot.pullRequestHeadSha === snapshot.localCommit;
    if (
      snapshot.allStoriesPassed &&
      exactHeadPublished &&
      snapshot.ciState === 'success' &&
      ['not-required', 'success'].includes(snapshot.adversarialState)
    ) {
      return {
        ...snapshot,
        nextAction: 'Wait for human review and merge; the issue branch is published on the passing exact head.',
        status: 'complete',
      };
    }
    const failureBlocked = snapshot.ciState === 'failure' || snapshot.adversarialState === 'failure';
    const missingBlocked =
      snapshot.ciState === 'missing' || snapshot.adversarialState === 'missing' || snapshot.ciState === 'none';
    if (failureBlocked || (missingBlocked && Date.now() >= missingChecksGraceUntil)) {
      return {
        ...snapshot,
        nextAction: !['not-required', 'success'].includes(snapshot.adversarialState)
          ? 'Publish or repair the required adversarial exact-head check before considering the issue complete.'
          : 'Resolve the required pull-request checks on the published head before considering the issue complete.',
        status: !['not-required', 'success'].includes(snapshot.adversarialState)
          ? 'adversarial-check-blocked'
          : 'ci-blocked',
      };
    }
    await sleep(10_000);
    verifyGitHubIdentity(loop.repoNameWithOwner.split('/')[0], githubEnvironment, repoRoot);
  }
}

export async function runRalphLoop(argv = process.argv.slice(2), { cwd = process.cwd(), env = process.env } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  const memory = resolveMemoryFiles(repoRoot, options.memoryDir);
  const plan = loadPlan(repoRoot, memory.relativeMemoryDir);
  validatePlan(plan);

  if (options.continuous && !plan.continuousByBestJudgment) {
    throw new Error('Continuous mode requires explicit delegation recorded in plan.json.');
  }

  const repoNameWithOwner = plan.repoNameWithOwner;
  const issueNumber = plan.issueNumber;
  const issueTitle = plan.issueTitle;
  const issueUrl = plan.issueUrl;
  const branchName = plan.branchName;
  const baseBranch = plan.baseBranch;
  const repoOwner = repoNameWithOwner.split('/')[0];
  const originUrl = git(repoRoot, 'config', '--get', 'remote.origin.url');
  const originNameWithOwner = remoteNameFromUrl(originUrl);

  if (originNameWithOwner !== repoNameWithOwner) {
    throw new Error(`Origin targets ${originNameWithOwner}, but the plan targets ${repoNameWithOwner}.`);
  }

  const githubEnvironment = createIsolatedGitHubEnvironment(repoOwner, { baseEnvironment: env });
  verifyGitHubIdentity(repoOwner, githubEnvironment, repoRoot);

  const actualRepo = gh(repoRoot, githubEnvironment, 'repo', 'view', repoNameWithOwner, '--json', 'nameWithOwner');
  if (JSON.parse(actualRepo).nameWithOwner !== repoNameWithOwner) {
    throw new Error(`GitHub resolved an unexpected repository: ${actualRepo}`);
  }
  const defaultBranch = JSON.parse(
    gh(repoRoot, githubEnvironment, 'repo', 'view', repoNameWithOwner, '--json', 'defaultBranchRef'),
  ).defaultBranchRef.name;
  if (defaultBranch !== baseBranch) {
    throw new Error(`The plan base branch ${baseBranch} is not the repository default branch ${defaultBranch}.`);
  }

  const liveIssue = JSON.parse(
    gh(
      repoRoot,
      githubEnvironment,
      'issue',
      'view',
      String(issueNumber),
      '--repo',
      repoNameWithOwner,
      '--json',
      'number,title,url,state',
    ),
  );
  if (liveIssue.number !== issueNumber) {
    throw new Error('GitHub returned an unexpected issue number.');
  }
  if (liveIssue.url !== issueUrl) {
    throw new Error('The plan issue URL does not match the live GitHub Issue.');
  }
  if (liveIssue.state !== 'OPEN') {
    throw new Error(`Issue #${issueNumber} is not open.`);
  }
  if (liveIssue.title !== issueTitle) {
    throw new Error('The live issue title changed. Refresh and recommit the issue memory before running.');
  }

  const currentBranch = git(repoRoot, 'branch', '--show-current');
  if (!currentBranch) {
    throw new Error('The repository is in detached HEAD state.');
  }
  if (currentBranch !== branchName) {
    throw new Error(`Current branch '${currentBranch}' does not match '${branchName}'.`);
  }
  if (currentBranch === baseBranch) {
    throw new Error('The Ralph Loop cannot run on the base branch.');
  }

  const { commonDir, worktreeRoot } = repositoryIdentity(repoRoot);
  const expectedWorktree = path.join(worktreeRoot, `issue-${issueNumber}`);
  if (repoRoot !== expectedWorktree) {
    throw new Error(`Issue #${issueNumber} must run in deterministic worktree ${expectedWorktree}, not ${repoRoot}.`);
  }

  ensureWorkspaceAgentGuides(repoRoot);
  ensureIterationLogsIgnored(repoRoot, memory.iterationsDir);

  const dirtyBeforeStart = worktreeDirtyStatus(repoRoot);
  const existingLease = readJsonIfExists(leaseFilePath(commonDir, issueNumber));
  const existingCheckpoint = readJsonIfExists(checkpointFilePath(commonDir, issueNumber));
  const existingLeaseEvaluation = evaluateLeaseState(existingLease, {
    now: Date.now(),
    staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER,
  });
  const recoveryAssessment = assessRecovery({
    leaseEvaluation: existingLeaseEvaluation,
    worktreeDirty: dirtyBeforeStart.dirty,
  });

  if (recoveryAssessment.action === 'refuse-active') {
    throw new Error(
      `Another Ralph Loop owns issue #${issueNumber} (host=${existingLease?.host ?? 'unknown'}, pid=${
        existingLease?.pid ?? 'unknown'
      }, run=${existingLease?.runId ?? 'unknown'}).`,
    );
  }
  if (recoveryAssessment.action === 'dirty-blocked') {
    throw new Error(
      `Worktree recovery is blocked by dirty files: ${dirtyBeforeStart.files.join(', ') || 'unknown changes'}. Preserve them for inspection.`,
    );
  }
  if (dirtyBeforeStart.dirty) {
    throw new Error('The worktree must be clean before starting.');
  }
  if (recoveryAssessment.action === 'archive-and-recover') {
    archiveRuntimeState(commonDir, issueNumber, {
      checkpoint: existingCheckpoint,
      lease: existingLease,
      reason: `recovered-by-${process.pid}`,
    });
  }

  fetchAndVerifyRemoteState(repoRoot, { baseBranch, branchName });
  let pullRequest = loadPullRequest({
    baseBranch,
    branchName,
    cwd: repoRoot,
    githubEnvironment,
    issueNumber,
    repoNameWithOwner,
  });

  const lockDirs = [];
  const runId = randomUUID();
  try {
    lockDirs.push(
      acquireLock(commonDir, {
        identity: `issue #${issueNumber}`,
        leasePath: leaseFilePath(commonDir, issueNumber),
        lockName: `issue-${issueNumber}`,
        runId,
        staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER,
      }),
    );
    lockDirs.push(
      acquireLock(commonDir, {
        identity: `branch ${branchName}`,
        leasePath: leaseFilePath(commonDir, issueNumber),
        lockName: `branch-${stableLockKey(branchName)}`,
        runId,
        staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER,
      }),
    );
    lockDirs.push(
      acquireLock(commonDir, {
        identity: `worktree ${repoRoot}`,
        leasePath: leaseFilePath(commonDir, issueNumber),
        lockName: `worktree-${stableLockKey(repoRoot)}`,
        runId,
        staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER,
      }),
    );

    const runtimeState = new RalphRuntimeState({
      commonDir,
      identity: {
        branchName,
        issueNumber,
        memoryDir: memory.relativeMemoryDir,
        repoNameWithOwner,
        runId,
        worktreePath: repoRoot,
      },
      issueNumber,
    });

    const initialHead = currentHead(repoRoot);
    runtimeState.startLease({ lastKnownHead: initialHead, phase: 'preflight' });
    const initialSnapshot = collectLoopSnapshot(
      { branchName, issueNumber, memoryDir: memory.relativeMemoryDir, repoNameWithOwner, worktreePath: repoRoot },
      { staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER },
    );
    runtimeState.updateCheckpoint(
      checkpointFromPlan(plan, {
        checkState: {
          adversarial: initialSnapshot.adversarialState,
          required: initialSnapshot.ciState,
        },
        lastPublishedCommit: initialSnapshot.remoteCommit,
        lastVerifiedHead: initialHead,
        nextResumableAction: `Launch iteration 1 in ${memory.relativeMemoryDir}.`,
        phase: 'preflight',
        pullRequest: pullRequest
          ? {
              headSha: pullRequest.headRefOid ?? null,
              number: pullRequest.number,
              state: pullRequest.state,
              url: pullRequest.url,
            }
          : null,
      }),
    );

    const copilotCommand = buildCopilotCommand(repoRoot, memory.relativeMemoryDir);
    if (options.dryRun) {
      process.stdout.write(
        `Validated Ralph Loop for issue #${issueNumber} in ${repoNameWithOwner} on branch ${branchName}.\n`,
      );
      process.stdout.write(`Command:${copilotCommand.map((part) => ` ${part}`).join('')}\n`);
      runtimeState.stopLease({
        lastKnownHead: initialHead,
        outcome: 'idle',
        reason: 'dry-run completed preflight validation',
      });
      return 0;
    }

    process.stdout.write(`Starting Ralph Loop for issue #${issueNumber}: ${issueTitle}\n`);
    process.stdout.write(
      `Repository: ${repoNameWithOwner}\nBranch: ${branchName}\nMemory: ${memory.relativeMemoryDir}\n`,
    );

    let currentPhase = 'preflight';
    let currentIteration = 0;
    let currentDeadlineAt = null;
    let signalRequested = null;
    let noPlanProgress = 0;

    const heartbeatTimer = setInterval(() => {
      runtimeState.updateLease({
        deadlineAt: currentDeadlineAt?.toISOString() ?? null,
        iteration: currentIteration,
        lastKnownHead: (() => {
          try {
            return currentHead(repoRoot);
          } catch {
            return runtimeState.lease?.lastKnownHead ?? null;
          }
        })(),
        phase: currentPhase,
      });
    }, options.heartbeatSeconds * 1000);

    const onSignal = (signal) => {
      signalRequested = signal;
    };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, onSignal);
    }

    const loop = {
      branchName,
      issueNumber,
      memoryDir: memory.relativeMemoryDir,
      repoNameWithOwner,
      worktreePath: repoRoot,
    };

    try {
      while (options.continuous || currentIteration < options.maxIterations) {
        currentIteration += 1;
        currentPhase = 'iteration-launch';
        currentDeadlineAt = new Date(Date.now() + options.iterationDeadlineMinutes * 60_000);

        const cleanStatus = worktreeDirtyStatus(repoRoot);
        if (cleanStatus.dirty) {
          runtimeState.stopLease({
            lastKnownHead: currentHead(repoRoot),
            outcome: 'dirty-blocked',
            reason: `Iteration ${currentIteration} cannot start with uncommitted changes.`,
          });
          throw new Error(`Iteration ${currentIteration} cannot start with uncommitted changes.`);
        }

        fetchAndVerifyRemoteState(repoRoot, { baseBranch, branchName });
        pullRequest = loadPullRequest({
          baseBranch,
          branchName,
          cwd: repoRoot,
          githubEnvironment,
          issueNumber,
          repoNameWithOwner,
        });

        const startingCommit = currentHead(repoRoot);
        const planBefore = loadPlan(repoRoot, memory.relativeMemoryDir);
        validatePlan(planBefore);
        assertPlanIdentity(planBefore, { baseBranch, branchName, issueNumber, repoNameWithOwner });
        const startingPassedCount = planBefore.stories.filter((story) => story.passes).length;
        const startingStoryCount = planBefore.stories.length;
        const logFile = nextLogFile(memory.iterationsDir);
        writeFileSync(logFile, '');
        runtimeState.logStream = {
          write(chunk) {
            writeFileSync(logFile, chunk, { flag: 'a' });
          },
        };
        runtimeState.updateLease({
          childPid: null,
          deadlineAt: currentDeadlineAt.toISOString(),
          iteration: currentIteration,
          lastKnownHead: startingCommit,
          phase: currentPhase,
        });
        runtimeState.updateCheckpoint(
          checkpointFromPlan(planBefore, {
            iteration: currentIteration,
            lastIterationLog: relativePath(repoRoot, logFile),
            lastVerifiedHead: startingCommit,
            nextResumableAction: `Wait for iteration ${currentIteration} to finish or stop it if the lease stops heartbeating.`,
            phase: 'iteration-launch',
          }),
        );

        process.stdout.write(`\n=== Ralph iteration ${currentIteration} ===\n`);
        currentPhase = 'agent-execution';
        runtimeState.updateLease({ phase: currentPhase });
        const childOutcome = await runChildProcess({
          command: copilotCommand,
          cwd: repoRoot,
          deadlineAt: currentDeadlineAt,
          environment: {
            ...githubEnvironment,
            MEMORY_DIR: memory.relativeMemoryDir,
          },
          onDeadline: () => {},
          onSignal: () => signalRequested,
          runtimeState,
        });
        runtimeState.updateLease({ childPid: null, phase: currentPhase });

        if (childOutcome.stopReason === 'cancelled') {
          runtimeState.stopLease({
            lastKnownHead: currentHead(repoRoot),
            outcome: 'cancelled',
            reason: `Received ${signalRequested} while running iteration ${currentIteration}.`,
          });
          return 130;
        }
        if (childOutcome.stopReason === 'timed-out') {
          runtimeState.stopLease({
            lastKnownHead: currentHead(repoRoot),
            outcome: 'timed-out',
            reason: `Iteration ${currentIteration} exceeded ${options.iterationDeadlineMinutes} minutes.`,
          });
          return 124;
        }
        if (childOutcome.result.code !== 0) {
          runtimeState.stopLease({
            lastKnownHead: currentHead(repoRoot),
            outcome: 'cancelled',
            reason: `Copilot exited with status ${childOutcome.result.code}. See ${relativePath(repoRoot, logFile)}.`,
          });
          throw new Error(
            `Copilot exited with status ${childOutcome.result.code}. See ${relativePath(repoRoot, logFile)}.`,
          );
        }

        const planAfter = loadPlan(repoRoot, memory.relativeMemoryDir);
        validatePlan(planAfter);
        assertPlanIdentity(planAfter, { baseBranch, branchName, issueNumber, repoNameWithOwner });

        const dirtyAfterChild = worktreeDirtyStatus(repoRoot);
        if (dirtyAfterChild.dirty) {
          runtimeState.stopLease({
            lastKnownHead: currentHead(repoRoot),
            outcome: 'dirty-blocked',
            reason: `Iteration ${currentIteration} left uncommitted changes. See ${relativePath(repoRoot, logFile)}.`,
          });
          throw new Error(
            `Iteration ${currentIteration} left uncommitted changes. Inspect the worktree and ${relativePath(repoRoot, logFile)}.`,
          );
        }

        const endingCommit = currentHead(repoRoot);
        const endingPassedCount = planAfter.stories.filter((story) => story.passes).length;
        const endingStoryCount = planAfter.stories.length;
        const reportedComplete = readFileSync(logFile, 'utf8').includes(COMPLETE_MARKER);

        if (startingCommit === endingCommit && !reportedComplete) {
          runtimeState.stopLease({
            lastKnownHead: endingCommit,
            outcome: 'cancelled',
            reason: `Iteration ${currentIteration} made no commit and did not report completion.`,
          });
          throw new Error(`Iteration ${currentIteration} made no commit and did not report completion.`);
        }

        if (endingPassedCount > startingPassedCount || endingStoryCount > startingStoryCount || reportedComplete) {
          noPlanProgress = 0;
        } else {
          noPlanProgress += 1;
          if (noPlanProgress >= 2) {
            runtimeState.stopLease({
              lastKnownHead: endingCommit,
              outcome: 'cancelled',
              reason: 'Two consecutive iterations committed without advancing or refining the story plan.',
            });
            throw new Error('Two consecutive iterations committed without advancing or refining the story plan.');
          }
        }

        runtimeState.updateCheckpoint(
          checkpointFromPlan(planAfter, {
            iteration: currentIteration,
            lastIterationLog: relativePath(repoRoot, logFile),
            lastVerifiedHead: endingCommit,
            nextResumableAction: `Push ${endingCommit} and update the draft pull request.`,
            phase: 'agent-execution',
          }),
        );

        currentPhase = 'validation-publication';
        runtimeState.updateLease({ lastKnownHead: endingCommit, phase: currentPhase });
        fetchAndVerifyRemoteState(repoRoot, { baseBranch, branchName });
        execText('git', ['push', '--set-upstream', 'origin', branchName], { cwd: repoRoot });

        pullRequest = loadPullRequest({
          baseBranch,
          branchName,
          cwd: repoRoot,
          githubEnvironment,
          issueNumber,
          repoNameWithOwner,
        });
        if (!pullRequest) {
          createPullRequest({
            baseBranch,
            branchName,
            cwd: repoRoot,
            githubEnvironment,
            issueNumber,
            issueTitle,
            repoNameWithOwner,
          });
          pullRequest = loadPullRequest({
            baseBranch,
            branchName,
            cwd: repoRoot,
            githubEnvironment,
            issueNumber,
            repoNameWithOwner,
          });
          if (!pullRequest) {
            throw new Error('Draft pull request creation returned without a discoverable pull request.');
          }
        }
        process.stdout.write(`Draft pull request: ${pullRequest.url}\n`);

        const publicationSnapshot = collectLoopSnapshot(loop, {
          staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER,
        });
        runtimeState.updateCheckpoint(
          checkpointFromPlan(planAfter, {
            checkState: {
              adversarial: publicationSnapshot.adversarialState,
              required: publicationSnapshot.ciState,
            },
            iteration: currentIteration,
            lastIterationLog: relativePath(repoRoot, logFile),
            lastPublishedCommit: endingCommit,
            lastVerifiedHead: endingCommit,
            nextResumableAction: reportedComplete
              ? 'Wait for required pull-request checks on the exact published head.'
              : `Launch iteration ${currentIteration + 1}.`,
            phase: currentPhase,
            pullRequest: {
              headSha: pullRequest.headRefOid ?? publicationSnapshot.pullRequestHeadSha ?? null,
              number: pullRequest.number,
              state: publicationSnapshot.pullRequestState,
              url: pullRequest.url,
            },
          }),
        );

        if (!reportedComplete) {
          continue;
        }

        if (!planAfter.stories.every((story) => story.passes)) {
          process.stdout.write('Completion was reported, but unfinished stories remain. Continuing.\n');
          continue;
        }

        currentPhase = 'check-wait';
        runtimeState.updateLease({ phase: currentPhase });
        const completionSnapshot = await waitForCheckOutcome({
          deadlineAt: currentDeadlineAt,
          githubEnvironment,
          loop,
          repoRoot,
          runtimeState,
          staleAfterMs: options.leaseStaleSeconds * LOCK_STALE_AFTER_MULTIPLIER,
        });

        if (completionSnapshot.status === 'complete') {
          runtimeState.updateCheckpoint(
            checkpointFromPlan(planAfter, {
              checkState: {
                adversarial: completionSnapshot.adversarialState,
                required: completionSnapshot.ciState,
              },
              iteration: currentIteration,
              lastPublishedCommit: endingCommit,
              lastVerifiedHead: endingCommit,
              nextResumableAction: 'Wait for human review and merge.',
              phase: 'check-wait',
              pullRequest: {
                headSha: completionSnapshot.pullRequestHeadSha,
                number: completionSnapshot.pullRequestNumber,
                state: completionSnapshot.pullRequestState,
                url: completionSnapshot.pullRequestUrl,
              },
            }),
          );
          runtimeState.stopLease({
            lastKnownHead: endingCommit,
            outcome: 'complete',
            reason: `Issue #${issueNumber} reached a passing exact-head draft pull request.`,
          });
          process.stdout.write(`Ralph Loop completed issue #${issueNumber} with passing CI checks.\n`);
          return 0;
        }
        if (completionSnapshot.status === 'timed-out') {
          process.stderr.write(`${completionSnapshot.nextAction}\n`);
          return 124;
        }

        const blockedStatus = !['not-required', 'success'].includes(completionSnapshot.adversarialState)
          ? 'adversarial-check-blocked'
          : 'ci-blocked';
        process.stdout.write(`Completion is blocked by ${blockedStatus}. ${completionSnapshot.nextAction}\n`);
      }

      runtimeState.stopLease({
        lastKnownHead: currentHead(repoRoot),
        outcome: 'idle',
        reason: `Reached the iteration limit (${options.maxIterations}) before completion.`,
      });
      process.stderr.write(`Ralph Loop reached ${options.maxIterations} iterations before completion.\n`);
      return 2;
    } catch (error) {
      if (!runtimeState.lease?.stop) {
        runtimeState.stopLease({
          lastKnownHead: (() => {
            try {
              return currentHead(repoRoot);
            } catch {
              return runtimeState.lease?.lastKnownHead ?? null;
            }
          })(),
          outcome: 'cancelled',
          reason: error.message,
        });
      }
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.removeListener(signal, onSignal);
      }
      runtimeState.logStream = null;
    }
  } finally {
    releaseLocks(lockDirs, runId);
  }
}

async function main() {
  try {
    const exitCode = await runRalphLoop();
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`Ralph Loop error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
