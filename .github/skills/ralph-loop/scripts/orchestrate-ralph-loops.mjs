#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assertCleanWorktree, deterministicWorktreePath, loadPlan, run, scheduleLoops } from './ralph-worktrees.mjs';
import { RalphStatusReporter } from './ralph-status-reporter.mjs';
import { createIsolatedGitHubEnvironment, verifyGitHubIdentity } from './ralph-github-auth.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const has = (name) => args.includes(name);
const fail = (message) => {
  console.error(`Ralph orchestrator error: ${message}`);
  process.exit(1);
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    process.exit(128);
  });
}

function collectStatus(loop, repoNameWithOwner) {
  const snapshot = {
    passedStoryIds: [],
    localCommit: null,
    remoteCommit: null,
    pullRequestState: 'none',
    pullRequestUrl: null,
    ciState: 'none',
    monitorError: null,
  };

  try {
    const plan = loadPlan(loop.worktreePath, loop.memoryDir);
    snapshot.passedStoryIds = plan.stories.filter((story) => story.passes).map((story) => story.id);
    snapshot.localCommit = run('git', ['rev-parse', 'HEAD'], {
      cwd: loop.worktreePath,
    });
    const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${loop.branchName}`], {
      cwd: loop.worktreePath,
    });
    snapshot.remoteCommit = remote ? remote.split(/\s+/)[0] : null;

    const pullRequests = JSON.parse(
      run(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          repoNameWithOwner,
          '--head',
          loop.branchName,
          '--state',
          'all',
          '--json',
          'url,state,isDraft,statusCheckRollup',
        ],
        { cwd: loop.worktreePath },
      ),
    );
    if (pullRequests.length > 1) {
      throw new Error(`multiple pull requests found for ${loop.branchName}`);
    }
    if (pullRequests.length === 1) {
      const pullRequest = pullRequests[0];
      snapshot.pullRequestUrl = pullRequest.url;
      snapshot.pullRequestState = `${pullRequest.state.toLowerCase()}:${pullRequest.isDraft ? 'draft' : 'ready'}`;
      const checks = pullRequest.statusCheckRollup ?? [];
      if (!checks.length) {
        snapshot.ciState = 'none';
      } else if (
        checks.some((check) =>
          ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.conclusion ?? check.state),
        )
      ) {
        snapshot.ciState = 'failure';
      } else if (
        checks.some((check) => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED'].includes(check.status ?? check.state))
      ) {
        snapshot.ciState = 'pending';
      } else {
        snapshot.ciState = 'success';
      }
    }
  } catch (error) {
    snapshot.monitorError = error.message;
  }

  return snapshot;
}

async function main() {
  const manifestPath = option('--manifest');
  if (!manifestPath) {
    fail('Usage: orchestrate-ralph-loops.mjs --manifest <json> [--plan-only]');
  }
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
  const manifest = JSON.parse(readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
  if (!Array.isArray(manifest.loops) || manifest.loops.length === 0) {
    throw new Error('Manifest loops must be a non-empty array.');
  }
  const repoNameWithOwner = manifest.repoNameWithOwner ?? 'jdylanmc/game-hub';
  const baseBranch = manifest.baseBranch ?? 'main';
  const owner = repoNameWithOwner.split('/')[0];
  const githubEnvironment = createIsolatedGitHubEnvironment(owner);
  verifyGitHubIdentity(owner, githubEnvironment, repoRoot);
  process.env.GH_TOKEN = githubEnvironment.GH_TOKEN;
  const loops = manifest.loops.map((entry) => {
    const worktreePath = deterministicWorktreePath(repoRoot, entry.issueNumber);
    const plan = loadPlan(worktreePath, entry.memoryDir);
    if (plan.issueNumber !== entry.issueNumber || plan.branchName !== entry.branchName) {
      throw new Error(`Manifest identity does not match ${entry.memoryDir}/plan.json.`);
    }
    const orchestration = plan.orchestration ?? {};
    return {
      issueNumber: entry.issueNumber,
      branchName: entry.branchName,
      memoryDir: entry.memoryDir,
      worktreePath,
      priority: orchestration.priority ?? entry.priority ?? 100,
      dependencies: orchestration.dependencies ?? entry.dependencies ?? [],
      changeScopes: orchestration.changeScopes ?? entry.changeScopes ?? ['.'],
    };
  });

  const dependencyStates = {};
  const dependencies = [...new Set(loops.flatMap((loop) => loop.dependencies))];
  for (const issueNumber of dependencies) {
    const issue = JSON.parse(
      execFileSync(
        'gh',
        [
          'issue',
          'view',
          String(issueNumber),
          '--repo',
          repoNameWithOwner,
          '--json',
          'state,closedByPullRequestsReferences',
        ],
        { encoding: 'utf8' },
      ),
    );
    let merged = false;
    for (const reference of issue.closedByPullRequestsReferences ?? []) {
      const pullRequest = JSON.parse(
        execFileSync(
          'gh',
          ['pr', 'view', reference.url, '--repo', repoNameWithOwner, '--json', 'state,mergedAt,baseRefName'],
          { encoding: 'utf8' },
        ),
      );
      merged ||= Boolean(pullRequest.mergedAt) && pullRequest.baseRefName === baseBranch;
    }
    dependencyStates[issueNumber] = issue.state === 'CLOSED' && merged ? 'merged' : 'open';
  }

  const { eligible, blocked } = scheduleLoops(loops, dependencyStates);
  for (const loop of blocked) {
    console.log(`BLOCKED issue #${loop.issueNumber}: waiting for merged issue(s) ${loop.unmetDependencies.join(', ')}`);
  }
  console.log(`ELIGIBLE ${eligible.map((loop) => `#${loop.issueNumber}`).join(', ') || 'none'}`);

  if (has('--plan-only')) return;
  const maxParallel = Number(option('--max-parallel', manifest.maxParallel ?? 2));
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    throw new Error('--max-parallel must be a positive integer.');
  }

  const queue = [...eligible];
  const running = new Map();
  let failed = false;
  const statusSeconds = Number(option('--status-interval', manifest.statusIntervalSeconds ?? 300));
  if (!Number.isFinite(statusSeconds) || statusSeconds <= 0) {
    throw new Error('--status-interval must be a positive number of seconds.');
  }
  const pollSeconds = Number(option('--poll-interval', manifest.statusPollSeconds ?? 30));
  if (!Number.isFinite(pollSeconds) || pollSeconds <= 0) {
    throw new Error('--poll-interval must be a positive number of seconds.');
  }
  for (const loop of eligible) {
    assertCleanWorktree(loop.worktreePath);
    const runner = path.join(loop.worktreePath, '.github/skills/ralph-loop/scripts/run-ralph-loop.sh');
    if (!existsSync(runner)) {
      throw new Error(`Missing Ralph runner in ${loop.worktreePath}.`);
    }
  }
  const reporter = new RalphStatusReporter({ heartbeatMs: statusSeconds * 1000 });
  const statusTimer = setInterval(() => {
    for (const { loop } of running.values()) {
      reporter.observe(loop, collectStatus(loop, repoNameWithOwner));
    }
  }, pollSeconds * 1000);

  const launch = (loop) => {
    reporter.reportLaunch(loop, collectStatus(loop, repoNameWithOwner));
    const runner = path.join(loop.worktreePath, '.github/skills/ralph-loop/scripts/run-ralph-loop.sh');
    const child = spawn(
      runner,
      ['--memory-dir', loop.memoryDir, '--max-iterations', String(manifest.maxIterations ?? 10)],
      {
        cwd: loop.worktreePath,
        env: { ...githubEnvironment },
        stdio: 'inherit',
      },
    );
    const childKey = child.pid ?? Symbol(`issue-${loop.issueNumber}`);
    running.set(childKey, { child, loop });
    let settled = false;
    const finish = (code, blocker) => {
      if (settled) return;
      settled = true;
      running.delete(childKey);
      failed ||= Boolean(blocker) || code !== 0;
      const snapshot = collectStatus(loop, repoNameWithOwner);
      reporter.observe(loop, snapshot);
      if (!blocker && code === 0) {
        reporter.reportCompletion(loop, snapshot);
      } else {
        reporter.reportBlocker(loop, blocker ?? `runner exited with status ${code}`, snapshot);
      }
      pump();
    };
    child.once('error', (error) => finish(null, `runner failed to start: ${error.message}`));
    child.once('exit', (code) => finish(code));
  };

  const pump = () => {
    while (queue.length && running.size < maxParallel && !failed) launch(queue.shift());
    if ((!queue.length || failed) && !running.size) {
      clearInterval(statusTimer);
      process.exitCode = failed ? 1 : 0;
    }
  };
  pump();
}

main().catch((error) => fail(error.message));
