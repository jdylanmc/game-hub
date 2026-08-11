#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertCleanWorktree,
  deterministicWorktreePath,
  loadPlan,
  scheduleLoops,
} from './ralph-worktrees.mjs';

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
let originalAccount;
let accountSwitched = false;

function restoreAccount() {
  if (!accountSwitched || !originalAccount) return;
  try {
    execFileSync(
      'gh',
      ['auth', 'switch', '--hostname', 'github.com', '--user', originalAccount],
      { stdio: 'ignore' },
    );
    accountSwitched = false;
  } catch {
    console.error(`Ralph orchestrator warning: could not restore ${originalAccount}.`);
    process.exitCode = 1;
  }
}

process.on('exit', restoreAccount);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restoreAccount();
    process.exit(128);
  });
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
  originalAccount = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
    encoding: 'utf8',
  }).trim();
  if (originalAccount !== owner) {
    execFileSync(
      'gh',
      ['auth', 'switch', '--hostname', 'github.com', '--user', owner],
      { stdio: 'ignore' },
    );
    accountSwitched = true;
  }
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
          [
            'pr',
            'view',
            reference.url,
            '--repo',
            repoNameWithOwner,
            '--json',
            'state,mergedAt,baseRefName',
          ],
          { encoding: 'utf8' },
        ),
      );
      merged ||= Boolean(pullRequest.mergedAt) && pullRequest.baseRefName === baseBranch;
    }
    dependencyStates[issueNumber] = issue.state === 'CLOSED' && merged ? 'merged' : 'open';
  }

  const { eligible, blocked } = scheduleLoops(loops, dependencyStates);
  for (const loop of blocked) {
    console.log(
      `BLOCKED issue #${loop.issueNumber}: waiting for merged issue(s) ${loop.unmetDependencies.join(', ')}`,
    );
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
  for (const loop of eligible) {
    assertCleanWorktree(loop.worktreePath);
    const runner = path.join(
      loop.worktreePath,
      '.github/skills/ralph-loop/scripts/run-ralph-loop.sh',
    );
    if (!existsSync(runner)) {
      throw new Error(`Missing Ralph runner in ${loop.worktreePath}.`);
    }
  }
  const statusTimer = setInterval(() => {
    if (running.size) {
      console.log(
        `STATUS running ${[...running.values()].map(({ loop }) => `#${loop.issueNumber}`).join(', ')}; queued ${queue.length}`,
      );
    }
  }, statusSeconds * 1000);

  const launch = (loop) => {
    console.log(`START issue #${loop.issueNumber} in ${loop.worktreePath}`);
    const runner = path.join(
      loop.worktreePath,
      '.github/skills/ralph-loop/scripts/run-ralph-loop.sh',
    );
    const child = spawn(
      runner,
      ['--memory-dir', loop.memoryDir, '--max-iterations', String(manifest.maxIterations ?? 10)],
      { cwd: loop.worktreePath, stdio: 'inherit' },
    );
    running.set(child.pid, { child, loop });
    child.once('exit', (code) => {
      running.delete(child.pid);
      failed ||= code !== 0;
      console.log(`FINISH issue #${loop.issueNumber}: exit ${code}`);
      pump();
    });
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
