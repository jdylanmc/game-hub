#!/usr/bin/env node

import assert from 'node:assert/strict';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  acquireLock,
  processAlive,
  RalphRuntimeState,
  releaseLock,
  stableLockKey,
} from '../scripts/ralph-runtime-state.mjs';
import {
  collectOutput,
  createRalphFixture,
  readCheckpoint,
  readLease,
  resetScratchRoot,
  setScratchRoot,
  scratchRoot,
  spawnRunner,
  waitForFile,
  waitForLease,
  writeGhState,
} from './fixture-helpers.mjs';

setScratchRoot('.ralph-test-work/runner-flow');

async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for a test condition.');
}

test.beforeEach(() => {
  resetScratchRoot();
});

test.after(() => rmSync(scratchRoot, { force: true, recursive: true }));

test('heartbeat advances while the child stays silent', async () => {
  const fixture = createRalphFixture('heartbeat');
  const runner = spawnRunner(fixture, ['--max-iterations', '1'], {
    FAKE_COPILOT_SCENARIO: 'silent-sleep',
    FAKE_COPILOT_SLEEP_MS: '6000',
    RALPH_HEARTBEAT_SECONDS: '1',
  });

  await waitForLease(fixture);
  const initialLease = await waitFor(() => {
    const lease = readLease(fixture);
    return lease?.phase === 'agent-execution' && Number.isInteger(lease.childPid) ? lease : false;
  });
  const firstHeartbeat = initialLease.lastHeartbeatAt;
  await waitFor(() => {
    const lease = readLease(fixture);
    return lease?.lastHeartbeatAt !== firstHeartbeat ? lease.lastHeartbeatAt : false;
  });
  assert.equal(readLease(fixture).childPid, initialLease.childPid);

  runner.kill('SIGTERM');
  const result = await collectOutput(runner);
  assert.equal(result.code, 130);
  assert.equal(readLease(fixture).stop.outcome, 'cancelled');
});

test('timeout kills only the owned child tree', async () => {
  const fixture = createRalphFixture('timeout');
  const descendantPath = path.join(scratchRoot, 'descendant.pid');
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });

  try {
    const runner = spawnRunner(fixture, ['--max-iterations', '1', '--iteration-deadline-minutes', '0.02'], {
      FAKE_CHILD_PID_PATH: descendantPath,
      FAKE_COPILOT_SCENARIO: 'spawn-descendant-and-sleep',
      FAKE_COPILOT_SLEEP_MS: '60000',
      RALPH_HEARTBEAT_SECONDS: '1',
    });

    const result = await collectOutput(runner);
    assert.equal(result.code, 124);
    await waitForFile(descendantPath);
    const descendantPid = Number(readFileSync(descendantPath, 'utf8').trim());
    assert.equal(processAlive(descendantPid), false);
    assert.equal(processAlive(sentinel.pid), true);
    assert.equal(readLease(fixture).stop.outcome, 'timed-out');
  } finally {
    try {
      sentinel.kill('SIGKILL');
    } catch {
      // Ignore already-exited sentinel processes.
    }
  }
});

test('cancellation records the stop state and preserves the checkpoint', async () => {
  const fixture = createRalphFixture('cancel');
  const runner = spawnRunner(fixture, ['--max-iterations', '1'], {
    FAKE_COPILOT_SCENARIO: 'silent-sleep',
    FAKE_COPILOT_SLEEP_MS: '6000',
    RALPH_HEARTBEAT_SECONDS: '1',
  });

  await waitForLease(fixture);
  await waitFor(() => readLease(fixture)?.phase === 'agent-execution');
  runner.kill('SIGTERM');
  const result = await collectOutput(runner);
  assert.ok(result.code === 130 || result.signal === 'SIGTERM');
  const lease = readLease(fixture);
  const checkpoint = readCheckpoint(fixture);
  assert.equal(lease.stop.outcome, 'cancelled');
  assert.match(lease.stop.reason, /SIGTERM/);
  assert.ok(['preflight', 'iteration-launch', 'agent-execution'].includes(checkpoint.phase));
  assert.ok(checkpoint.lastVerifiedHead);
});

test('stale lease and abandoned locks recover by archiving prior state', async () => {
  const fixture = createRalphFixture('recovery');
  const staleLease = {
    version: 1,
    repoNameWithOwner: 'jdylanmc/game-hub',
    issueNumber: fixture.issueNumber,
    memoryDir: fixture.memoryDir,
    branchName: fixture.branchName,
    worktreePath: fixture.worktreePath,
    runId: 'stale-run',
    pid: 999999,
    host: os.hostname(),
    iteration: 1,
    phase: 'agent-execution',
    startedAt: '2026-08-11T00:00:00.000Z',
    lastHeartbeatAt: '2026-08-11T00:00:00.000Z',
    lastKnownHead: 'deadbeef',
    childPid: 999998,
    stop: null,
  };
  const staleCheckpoint = {
    version: 1,
    repoNameWithOwner: 'jdylanmc/game-hub',
    issueNumber: fixture.issueNumber,
    memoryDir: fixture.memoryDir,
    branchName: fixture.branchName,
    worktreePath: fixture.worktreePath,
    runId: 'stale-run',
    updatedAt: '2026-08-11T00:00:00.000Z',
    lastVerifiedHead: 'deadbeef',
    nextResumableAction: 'Recover the stale run.',
  };
  mkdirSync(path.dirname(fixture.leasePath), { recursive: true });
  mkdirSync(path.dirname(fixture.checkpointPath), { recursive: true });
  writeFileSync(fixture.leasePath, `${JSON.stringify(staleLease, null, 2)}\n`);
  writeFileSync(fixture.checkpointPath, `${JSON.stringify(staleCheckpoint, null, 2)}\n`);
  const locksRoot = path.join(fixture.commonDir, 'ralph-locks');
  mkdirSync(locksRoot, { recursive: true });
  const lockTargets = [
    `issue-${fixture.issueNumber}`,
    `branch-${stableLockKey(fixture.branchName)}`,
    `worktree-${stableLockKey(fixture.worktreePath)}`,
  ];
  for (const lockTarget of lockTargets) {
    const lockDir = path.join(locksRoot, `${lockTarget}.lock`);
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      path.join(lockDir, 'metadata.json'),
      `${JSON.stringify(
        {
          host: os.hostname(),
          identity: lockTarget,
          leasePath: fixture.leasePath,
          lockName: lockTarget,
          pid: 999999,
          runId: 'stale-run',
          startedAt: '2026-08-11T00:00:00.000Z',
          version: 1,
        },
        null,
        2,
      )}\n`,
    );
  }

  const runner = spawnRunner(fixture, ['--max-iterations', '1'], {
    FAKE_COPILOT_SCENARIO: 'complete',
    RALPH_HEARTBEAT_SECONDS: '1',
  });

  const result = await collectOutput(runner);
  assert.equal(result.code, 0);
  const archiveDirectory = path.join(fixture.commonDir, 'ralph-state', `issue-${fixture.issueNumber}`, 'archives');
  const archivedFiles = readdirSync(archiveDirectory);
  assert.ok(archivedFiles.length >= 1);
  assert.notEqual(readLease(fixture).runId, 'stale-run');
});

test('active leases are refused without takeover', async () => {
  const fixture = createRalphFixture('active');
  mkdirSync(path.dirname(fixture.leasePath), { recursive: true });
  writeFileSync(
    fixture.leasePath,
    `${JSON.stringify(
      {
        version: 1,
        repoNameWithOwner: 'jdylanmc/game-hub',
        issueNumber: fixture.issueNumber,
        memoryDir: fixture.memoryDir,
        branchName: fixture.branchName,
        worktreePath: fixture.worktreePath,
        runId: 'active-run',
        pid: process.pid,
        host: os.hostname(),
        iteration: 1,
        phase: 'agent-execution',
        startedAt: '2026-08-11T00:00:00.000Z',
        lastHeartbeatAt: '2026-08-11T00:00:00.000Z',
        lastKnownHead: 'current',
        childPid: null,
        stop: null,
      },
      null,
      2,
    )}\n`,
  );

  const runner = spawnRunner(fixture, ['--dry-run'], { RALPH_HEARTBEAT_SECONDS: '1' });
  const result = await collectOutput(runner);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /owns issue/);
});

test('a live detached child prevents takeover after its runner dies', async () => {
  const fixture = createRalphFixture('live-child-owner');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });

  try {
    mkdirSync(path.dirname(fixture.leasePath), { recursive: true });
    writeFileSync(
      fixture.leasePath,
      `${JSON.stringify(
        {
          version: 1,
          repoNameWithOwner: 'jdylanmc/game-hub',
          issueNumber: fixture.issueNumber,
          memoryDir: fixture.memoryDir,
          branchName: fixture.branchName,
          worktreePath: fixture.worktreePath,
          runId: 'child-owned-run',
          pid: 999999,
          host: os.hostname(),
          iteration: 1,
          phase: 'agent-execution',
          startedAt: '2026-08-11T00:00:00.000Z',
          lastHeartbeatAt: '2026-08-11T00:00:00.000Z',
          lastKnownHead: 'current',
          childPid: child.pid,
          stop: null,
        },
        null,
        2,
      )}\n`,
    );

    const runner = spawnRunner(fixture, ['--dry-run'], { RALPH_HEARTBEAT_SECONDS: '1' });
    const result = await collectOutput(runner);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /owns issue/);
    assert.equal(processAlive(child.pid), true);
  } finally {
    child.kill('SIGKILL');
  }
});

test('lock release refuses to delete a successor owner', () => {
  const fixture = createRalphFixture('release-owner');
  const leasePath = path.join(fixture.commonDir, 'lease.json');
  const lockDir = acquireLock(fixture.commonDir, {
    identity: 'issue ownership',
    leasePath,
    lockName: 'release-owner',
    runId: 'first-run',
  });
  const metadataPath = path.join(lockDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  writeFileSync(metadataPath, `${JSON.stringify({ ...metadata, runId: 'second-run' }, null, 2)}\n`);

  assert.throws(() => releaseLock(lockDir, 'first-run'), /no longer owned/);
  assert.equal(existsSync(lockDir), true);
  releaseLock(lockDir, 'second-run');
});

test('a recovery owner cannot be preempted before publishing its lease', () => {
  const fixture = createRalphFixture('takeover-window');
  mkdirSync(path.dirname(fixture.leasePath), { recursive: true });
  writeFileSync(
    fixture.leasePath,
    `${JSON.stringify(
      {
        childPid: null,
        host: os.hostname(),
        lastHeartbeatAt: '2026-08-11T00:00:00.000Z',
        phase: 'agent-execution',
        pid: 999999,
        runId: 'stale-run',
        startedAt: '2026-08-11T00:00:00.000Z',
        stop: null,
        version: 1,
      },
      null,
      2,
    )}\n`,
  );

  const firstLock = acquireLock(fixture.commonDir, {
    identity: 'takeover ownership',
    leasePath: fixture.leasePath,
    lockName: 'takeover-window',
    runId: 'first-run',
  });
  assert.throws(
    () =>
      acquireLock(fixture.commonDir, {
        identity: 'takeover ownership',
        leasePath: fixture.leasePath,
        lockName: 'takeover-window',
        runId: 'second-run',
      }),
    /owns takeover ownership/,
  );
  releaseLock(firstLock, 'first-run');
});

test('a predecessor cannot overwrite successor runtime state after takeover', () => {
  const fixture = createRalphFixture('runtime-owner');
  const lockName = 'runtime-owner';
  const oldLock = acquireLock(fixture.commonDir, {
    identity: 'runtime ownership',
    leasePath: fixture.leasePath,
    lockName,
    runId: 'old-run',
  });
  const oldState = new RalphRuntimeState({
    commonDir: fixture.commonDir,
    identity: {
      branchName: fixture.branchName,
      issueNumber: fixture.issueNumber,
      memoryDir: fixture.memoryDir,
      repoNameWithOwner: 'jdylanmc/game-hub',
      runId: 'old-run',
      worktreePath: fixture.worktreePath,
    },
    issueNumber: fixture.issueNumber,
    lockDirs: [oldLock],
  });
  oldState.startLease({ lastKnownHead: 'old-head' });
  oldState.updateCheckpoint({ lastVerifiedHead: 'old-head' });
  writeFileSync(
    fixture.leasePath,
    `${JSON.stringify(
      {
        ...readLease(fixture),
        lastHeartbeatAt: '2026-08-11T00:00:00.000Z',
        pid: 999999,
      },
      null,
      2,
    )}\n`,
  );
  const oldMetadataPath = path.join(oldLock, 'metadata.json');
  const oldMetadata = JSON.parse(readFileSync(oldMetadataPath, 'utf8'));
  writeFileSync(
    oldMetadataPath,
    `${JSON.stringify({ ...oldMetadata, pid: 999999, startedAt: '2026-08-11T00:00:00.000Z' }, null, 2)}\n`,
  );

  const newLock = acquireLock(fixture.commonDir, {
    identity: 'runtime ownership',
    leasePath: fixture.leasePath,
    lockName,
    runId: 'new-run',
  });
  const newState = new RalphRuntimeState({
    commonDir: fixture.commonDir,
    identity: {
      branchName: fixture.branchName,
      issueNumber: fixture.issueNumber,
      memoryDir: fixture.memoryDir,
      repoNameWithOwner: 'jdylanmc/game-hub',
      runId: 'new-run',
      worktreePath: fixture.worktreePath,
    },
    issueNumber: fixture.issueNumber,
    lockDirs: [newLock],
  });
  newState.startLease({ lastKnownHead: 'new-head' });
  newState.updateCheckpoint({ lastVerifiedHead: 'new-head' });

  assert.throws(() => oldState.updateLease({ phase: 'agent-execution' }), /no longer owns/);
  assert.throws(() => oldState.updateCheckpoint({ lastVerifiedHead: 'wrong-head' }), /no longer owns/);
  assert.equal(readLease(fixture).runId, 'new-run');
  assert.equal(readCheckpoint(fixture).runId, 'new-run');
  assert.equal(readCheckpoint(fixture).lastVerifiedHead, 'new-head');
  releaseLock(newLock, 'new-run');
});

test('dirty worktrees block deterministic recovery', async () => {
  const fixture = createRalphFixture('dirty-recovery');
  mkdirSync(path.dirname(fixture.leasePath), { recursive: true });
  writeFileSync(
    fixture.leasePath,
    `${JSON.stringify(
      {
        version: 1,
        repoNameWithOwner: 'jdylanmc/game-hub',
        issueNumber: fixture.issueNumber,
        memoryDir: fixture.memoryDir,
        branchName: fixture.branchName,
        worktreePath: fixture.worktreePath,
        runId: 'stale-run',
        pid: 999999,
        host: os.hostname(),
        iteration: 1,
        phase: 'agent-execution',
        startedAt: '2026-08-11T00:00:00.000Z',
        lastHeartbeatAt: '2026-08-11T00:00:00.000Z',
        lastKnownHead: 'deadbeef',
        childPid: null,
        stop: null,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(fixture.worktreePath, 'dirty.txt'), 'preserve me\n');

  const runner = spawnRunner(fixture, ['--dry-run'], { RALPH_HEARTBEAT_SECONDS: '1' });
  const result = await collectOutput(runner);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /dirty files/i);
});

test('checkpoints persist the published exact head and completion metadata', async () => {
  const fixture = createRalphFixture('checkpoint');
  const runner = spawnRunner(fixture, ['--max-iterations', '1'], {
    FAKE_COPILOT_SCENARIO: 'complete',
    RALPH_HEARTBEAT_SECONDS: '1',
  });

  const result = await collectOutput(runner);
  assert.equal(result.code, 0);
  const checkpoint = readCheckpoint(fixture);
  const lease = readLease(fixture);
  assert.equal(checkpoint.plan.allStoriesPassed, true);
  assert.equal(checkpoint.checkState.required, 'success');
  assert.equal(checkpoint.pullRequest.headSha, checkpoint.lastPublishedCommit);
  assert.match(checkpoint.nextResumableAction, /human review and merge/i);
  assert.ok(checkpoint.lastVerifiedHead);
  assert.equal(lease.stop.outcome, 'complete');
});

test('pending checks time out with a truthful check-wait checkpoint', async () => {
  const fixture = createRalphFixture('pending-check-timeout');
  writeGhState(fixture, { checkState: 'pending' });
  const runner = spawnRunner(fixture, ['--max-iterations', '1', '--iteration-deadline-minutes', '0.1'], {
    FAKE_COPILOT_SCENARIO: 'complete',
    RALPH_HEARTBEAT_SECONDS: '1',
  });

  const result = await collectOutput(runner);
  assert.equal(result.code, 124);
  const lease = readLease(fixture);
  const checkpoint = readCheckpoint(fixture);
  assert.equal(lease.stop.outcome, 'timed-out');
  assert.match(lease.stop.reason, /waiting for pull-request checks/);
  assert.equal(checkpoint.phase, 'check-wait');
  assert.equal(checkpoint.checkState.required, 'pending');
  assert.match(checkpoint.nextResumableAction, /inspect the pending exact-head checks/i);
});

test('cancellation during check wait records a resumable cancelled state', async () => {
  const fixture = createRalphFixture('pending-check-cancel');
  writeGhState(fixture, { checkState: 'pending' });
  const runner = spawnRunner(fixture, ['--max-iterations', '1', '--iteration-deadline-minutes', '1'], {
    EXPECTED_GH_TOKEN: 'test-token',
    FAKE_COPILOT_SCENARIO: 'complete',
    RALPH_HEARTBEAT_SECONDS: '1',
  });

  await waitFor(() => readLease(fixture)?.phase === 'check-wait', 20_000);
  runner.kill('SIGTERM');
  const result = await collectOutput(runner);
  assert.equal(result.code, 130);
  const lease = readLease(fixture);
  const checkpoint = readCheckpoint(fixture);
  assert.equal(lease.stop.outcome, 'cancelled');
  assert.match(lease.stop.reason, /waiting for pull-request checks/);
  assert.equal(checkpoint.phase, 'check-wait');
  assert.match(checkpoint.nextResumableAction, /inspect the pending exact-head checks/i);
});
