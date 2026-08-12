#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { collectLoopSnapshot } from '../scripts/ralph-status.mjs';
import {
  gitCommand,
  createRalphFixture,
  resetScratchRoot,
  setScratchRoot,
  scratchRoot,
  writeGhState,
} from './fixture-helpers.mjs';

setScratchRoot('.ralph-test-work/runner-status');

function markStoriesPassed(fixture) {
  const planPath = path.join(fixture.worktreePath, fixture.memoryDir, 'plan.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.stories = plan.stories.map((story) => ({ ...story, passes: true }));
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  gitCommand(fixture.worktreePath, 'add', '.');
  gitCommand(fixture.worktreePath, 'commit', '-m', 'mark stories passed');
}

function publishedSnapshot(fixture) {
  gitCommand(fixture.worktreePath, 'push', '--set-upstream', 'origin', fixture.branchName);
  writeGhState(fixture, { prExists: true });
  const originalPath = process.env.PATH;
  const originalGhState = process.env.FAKE_GH_STATE_PATH;
  const originalToken = process.env.GH_TOKEN;
  try {
    process.env.PATH = `${fixture.binDir}:${originalPath}`;
    process.env.FAKE_GH_STATE_PATH = fixture.ghStatePath;
    process.env.GH_TOKEN = 'test-token';
    return collectLoopSnapshot(
      {
        branchName: fixture.branchName,
        issueNumber: fixture.issueNumber,
        memoryDir: fixture.memoryDir,
        worktreePath: fixture.worktreePath,
      },
      {
        githubEnvironment: {
          ...process.env,
          EXPECTED_GH_TOKEN: 'isolated-token',
          GH_TOKEN: 'isolated-token',
        },
      },
    );
  } finally {
    process.env.PATH = originalPath;
    if (originalGhState === undefined) {
      delete process.env.FAKE_GH_STATE_PATH;
    } else {
      process.env.FAKE_GH_STATE_PATH = originalGhState;
    }
    if (originalToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = originalToken;
    }
  }
}

test.beforeEach(() => {
  resetScratchRoot();
});

test.after(() => rmSync(scratchRoot, { force: true, recursive: true }));

test('missing, pending, failed, skipped, and neutral required checks are CI-blocked', () => {
  for (const [checkState, expectedState] of [
    ['missing', 'missing'],
    ['pending', 'pending'],
    ['failure', 'failure'],
    ['skipped', 'failure'],
    ['neutral', 'failure'],
  ]) {
    const fixture = createRalphFixture(`status-${checkState}`);
    markStoriesPassed(fixture);
    writeGhState(fixture, { checkState });
    const snapshot = publishedSnapshot(fixture);
    assert.equal(snapshot.ciState, expectedState);
    assert.equal(snapshot.status, 'ci-blocked');
  }
});

test('missing adversarial checks block otherwise passing completion', () => {
  const fixture = createRalphFixture('status-adversarial', {
    planPatch: {
      publication: {
        adversarialStatusChecks: ['Adversarial review'],
      },
    },
  });
  markStoriesPassed(fixture);
  writeGhState(fixture, {
    adversarialState: 'missing',
    checkState: 'success',
  });
  const snapshot = publishedSnapshot(fixture);
  assert.equal(snapshot.ciState, 'success');
  assert.equal(snapshot.adversarialState, 'missing');
  assert.equal(snapshot.status, 'adversarial-check-blocked');
});

test('passing required checks on the published head report completion', () => {
  const fixture = createRalphFixture('status-complete');
  markStoriesPassed(fixture);
  writeGhState(fixture, {
    adversarialState: 'missing',
    checkState: 'success',
  });
  const snapshot = publishedSnapshot(fixture);
  assert.equal(snapshot.ciState, 'success');
  assert.equal(snapshot.status, 'complete');
});
