#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  deterministicWorktreePath,
  prepareWorktree,
  scheduleLoops,
  verifyRemoteBranch,
} from '../scripts/ralph-worktrees.mjs';
import { RalphStatusReporter } from '../scripts/ralph-status-reporter.mjs';

const scratchRoot = path.resolve('.ralph-test-work');

function command(commandName, args, cwd) {
  return execFileSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createRepository(name) {
  const root = path.join(scratchRoot, name);
  const remote = path.join(scratchRoot, `${name}.git`);
  mkdirSync(root, { recursive: true });
  command('git', ['init', '--bare', remote], scratchRoot);
  command('git', ['init', '-b', 'main'], root);
  command('git', ['config', 'user.email', 'ralph-test@example.invalid'], root);
  command('git', ['config', 'user.name', 'Ralph Test'], root);
  writeFileSync(path.join(root, 'README.md'), 'test\n');
  command('git', ['add', '.'], root);
  command('git', ['commit', '-m', 'initial'], root);
  command('git', ['remote', 'add', 'origin', remote], root);
  command('git', ['push', '-u', 'origin', 'main'], root);
  return { root, remote };
}

const loop = (root, issueNumber, overrides = {}) => ({
  issueNumber,
  branchName: overrides.branchName ?? `ralph/issue-${issueNumber}`,
  worktreePath:
    overrides.worktreePath ?? deterministicWorktreePath(root, issueNumber),
  priority: overrides.priority ?? issueNumber,
  dependencies: overrides.dependencies ?? [],
  changeScopes: overrides.changeScopes ?? [`games/game-${issueNumber}`],
});

test.beforeEach(() => {
  rmSync(scratchRoot, { recursive: true, force: true });
  mkdirSync(scratchRoot, { recursive: true });
});

test.after(() => rmSync(scratchRoot, { recursive: true, force: true }));

test('two independent issue loops coexist in deterministic worktrees', () => {
  const { root } = createRepository('parallel');
  const first = prepareWorktree({
    repoRoot: root,
    issueNumber: 41,
    branchName: 'ralph/issue-41',
  });
  const second = prepareWorktree({
    repoRoot: root,
    issueNumber: 42,
    branchName: 'ralph/issue-42',
  });
  assert.notEqual(first.worktreePath, second.worktreePath);
  assert.deepEqual(
    scheduleLoops([loop(root, 42), loop(root, 41)]).eligible.map(
      ({ issueNumber }) => issueNumber,
    ),
    [41, 42],
  );
});

test('duplicate issue, branch, and worktree ownership fail safely', () => {
  const { root } = createRepository('ownership');
  assert.throws(() => scheduleLoops([loop(root, 41), loop(root, 41)]), /duplicate ownership/);
  assert.throws(
    () =>
      scheduleLoops([
        loop(root, 41, { branchName: 'shared' }),
        loop(root, 42, { branchName: 'shared' }),
      ]),
    /Branch shared/,
  );
  assert.throws(
    () =>
      scheduleLoops([
        loop(root, 41, { worktreePath: '/same' }),
        loop(root, 42, { worktreePath: '/same' }),
      ]),
    /Worktree \/same/,
  );
});

test('unmerged dependencies block a loop and priorities order eligible loops', () => {
  const { root } = createRepository('dependencies');
  const result = scheduleLoops(
    [
      loop(root, 41, { priority: 2 }),
      loop(root, 42, { priority: 1, dependencies: [40] }),
      loop(root, 43, { priority: 1 }),
    ],
    { 40: 'open' },
  );
  assert.deepEqual(result.eligible.map(({ issueNumber }) => issueNumber), [43, 41]);
  assert.deepEqual(result.blocked[0].unmetDependencies, [40]);
  assert.throws(
    () =>
      scheduleLoops([
        loop(root, 44, { dependencies: [45] }),
        loop(root, 45, { dependencies: [44] }),
      ]),
    /dependency cycle/,
  );
});

test('overlapping change scopes are refused', () => {
  const { root } = createRepository('scope');
  assert.throws(
    () =>
      scheduleLoops([
        loop(root, 41, { changeScopes: ['games'] }),
        loop(root, 42, { changeScopes: ['games/new-game'] }),
      ]),
    /Unsafe overlap/,
  );
});

test('dirty worktrees are preserved and rejected', () => {
  const { root } = createRepository('dirty');
  const prepared = prepareWorktree({
    repoRoot: root,
    issueNumber: 41,
    branchName: 'ralph/issue-41',
  });
  writeFileSync(path.join(prepared.worktreePath, 'dirty.txt'), 'preserve me\n');
  assert.throws(
    () =>
      prepareWorktree({
        repoRoot: root,
        issueNumber: 41,
        branchName: 'ralph/issue-41',
      }),
    /dirty; preserve it/,
  );
});

test('remote branch divergence stops without changing either side', () => {
  const { root, remote } = createRepository('divergence');
  const prepared = prepareWorktree({
    repoRoot: root,
    issueNumber: 41,
    branchName: 'ralph/issue-41',
  });
  writeFileSync(path.join(prepared.worktreePath, 'local.txt'), 'local\n');
  command('git', ['add', '.'], prepared.worktreePath);
  command('git', ['commit', '-m', 'local'], prepared.worktreePath);

  const other = path.join(scratchRoot, 'other');
  command('git', ['clone', remote, other], scratchRoot);
  command('git', ['config', 'user.email', 'ralph-test@example.invalid'], other);
  command('git', ['config', 'user.name', 'Ralph Test'], other);
  command('git', ['checkout', '-b', 'ralph/issue-41', 'origin/main'], other);
  writeFileSync(path.join(other, 'remote.txt'), 'remote\n');
  command('git', ['add', '.'], other);
  command('git', ['commit', '-m', 'remote'], other);
  command('git', ['push', 'origin', 'ralph/issue-41'], other);

  assert.throws(
    () => verifyRemoteBranch(root, 'ralph/issue-41'),
    /behind or diverged/,
  );
  assert.equal(command('git', ['show', 'HEAD:local.txt'], prepared.worktreePath), 'local');
  assert.equal(
    command('git', ['show', 'origin/ralph/issue-41:remote.txt'], root),
    'remote',
  );
});

test('meaningful status changes emit once while unchanged polls stay quiet', () => {
  let now = 0;
  const reports = [];
  const reporter = new RalphStatusReporter({
    emit: (report) => reports.push(report),
    now: () => now,
    heartbeatMs: 300_000,
  });
  const statusLoop = {
    issueNumber: 41,
    branchName: 'ralph/issue-41',
    worktreePath: '/worktrees/issue-41',
  };
  const initial = {
    passedStoryIds: [],
    localCommit: 'aaa',
    remoteCommit: null,
    pullRequestState: 'none',
    pullRequestUrl: null,
    ciState: 'none',
    monitorError: null,
  };

  reporter.reportLaunch(statusLoop, initial);
  reporter.observe(statusLoop, initial);
  now = 299_999;
  reporter.observe(statusLoop, initial);
  assert.deepEqual(reports.map(({ type }) => type), ['loop-launch']);

  now = 300_000;
  reporter.observe(statusLoop, initial);
  reporter.observe(statusLoop, initial);
  assert.deepEqual(reports.map(({ type }) => type), [
    'loop-launch',
    'periodic-heartbeat',
  ]);

  now += 1;
  const storyComplete = {
    ...initial,
    passedStoryIds: ['US-001'],
    localCommit: 'bbb',
  };
  reporter.observe(statusLoop, storyComplete);
  reporter.observe(statusLoop, storyComplete);
  assert.equal(reports.at(-1).type, 'meaningful-change');
  assert.deepEqual(
    reports.at(-1).transitions.map(({ type }) => type),
    ['story-completion', 'publication-change'],
  );

  const published = {
    ...storyComplete,
    remoteCommit: 'bbb',
    pullRequestState: 'open:draft',
    pullRequestUrl: 'https://github.com/jdylanmc/game-hub/pull/99',
    ciState: 'pending',
  };
  reporter.observe(statusLoop, published);
  reporter.observe(statusLoop, published);
  assert.deepEqual(
    reports.at(-1).transitions.map(({ type }) => type),
    ['publication-change', 'ci-change'],
  );
  assert.equal(reports.length, 4);
});

test('blocker and completion transitions are deduplicated', () => {
  const reports = [];
  const reporter = new RalphStatusReporter({
    emit: (report) => reports.push(report),
    now: () => 0,
  });
  const statusLoop = {
    issueNumber: 41,
    branchName: 'ralph/issue-41',
    worktreePath: '/worktrees/issue-41',
  };
  const snapshot = {
    passedStoryIds: ['US-001'],
    localCommit: 'aaa',
    remoteCommit: 'aaa',
    pullRequestState: 'open:draft',
    pullRequestUrl: 'https://github.com/jdylanmc/game-hub/pull/99',
    ciState: 'failure',
    monitorError: null,
  };
  reporter.reportLaunch(statusLoop, snapshot);
  reporter.reportBlocker(statusLoop, 'CI failed', snapshot);
  reporter.reportBlocker(statusLoop, 'CI failed', snapshot);
  reporter.reportCompletion(statusLoop, snapshot);
  reporter.reportCompletion(statusLoop, snapshot);
  assert.deepEqual(reports.map(({ type }) => type), [
    'loop-launch',
    'blocker',
    'loop-completion',
  ]);
});
