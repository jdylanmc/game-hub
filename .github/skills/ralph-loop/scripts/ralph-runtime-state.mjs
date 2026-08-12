#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_HEARTBEAT_SECONDS = 15;
export const DEFAULT_STALE_AFTER_SECONDS = 60;
export const DEFAULT_ITERATION_DEADLINE_MINUTES = 90;

function mergeRecord(base, patch) {
  const result = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeRecord(result[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function runtimeStateRoot(commonDir) {
  return path.join(commonDir, 'ralph-state');
}

export function issueStateDirectory(commonDir, issueNumber) {
  return path.join(runtimeStateRoot(commonDir), `issue-${issueNumber}`);
}

export function leaseFilePath(commonDir, issueNumber) {
  return path.join(issueStateDirectory(commonDir, issueNumber), 'lease.json');
}

export function checkpointFilePath(commonDir, issueNumber) {
  return path.join(issueStateDirectory(commonDir, issueNumber), 'checkpoint.json');
}

export function archiveDirectory(commonDir, issueNumber) {
  return path.join(issueStateDirectory(commonDir, issueNumber), 'archives');
}

export function lockRootDirectory(commonDir) {
  return path.join(commonDir, 'ralph-locks');
}

export function lockArchiveDirectory(commonDir) {
  return path.join(runtimeStateRoot(commonDir), 'lock-archives');
}

export function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function atomicWriteJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, filePath);
}

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function parseGitStatusPorcelain(statusOutput) {
  return statusOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter(Boolean);
}

export function stableLockKey(value) {
  return createHash('sha1').update(String(value)).digest('hex');
}

export function evaluateLeaseState(
  lease,
  {
    now = Date.now(),
    host = os.hostname(),
    staleAfterMs = DEFAULT_STALE_AFTER_SECONDS * 1000,
    processProbe = processAlive,
  } = {},
) {
  if (!lease) {
    return {
      state: 'missing',
      runnerAlive: false,
      childAlive: false,
      heartbeatAgeMs: null,
      fresh: false,
      sameHost: false,
      isStopped: false,
      stopOutcome: null,
      stopReason: null,
    };
  }

  const heartbeatEpoch = Date.parse(lease.lastHeartbeatAt ?? lease.startedAt ?? '');
  const heartbeatAgeMs = Number.isNaN(heartbeatEpoch) ? Number.POSITIVE_INFINITY : Math.max(0, now - heartbeatEpoch);
  const sameHost = lease.host === host;
  const runnerAlive = sameHost ? processProbe(lease.pid) : null;
  const childAlive = sameHost ? processProbe(lease.childPid) : null;
  const fresh = heartbeatAgeMs <= staleAfterMs;
  const isStopped = Boolean(lease.stop?.at || lease.stop?.outcome || lease.phase === 'stop');

  let state = 'stopped';
  if (!isStopped && runnerAlive === true && fresh) {
    state = 'active';
  } else if (!isStopped && runnerAlive === false) {
    state = 'dead';
  } else if (!isStopped) {
    state = 'stale';
  }

  return {
    state,
    runnerAlive,
    childAlive,
    heartbeatAgeMs,
    fresh,
    sameHost,
    isStopped,
    stopOutcome: lease.stop?.outcome ?? null,
    stopReason: lease.stop?.reason ?? null,
  };
}

function readLegacyLockField(lockDir, fileName) {
  const fieldPath = path.join(lockDir, fileName);
  if (!existsSync(fieldPath)) return null;
  return readFileSync(fieldPath, 'utf8').trim() || null;
}

export function readLockMetadata(lockDir) {
  const metadataPath = path.join(lockDir, 'metadata.json');
  if (existsSync(metadataPath)) {
    return JSON.parse(readFileSync(metadataPath, 'utf8'));
  }
  if (!existsSync(lockDir)) {
    return null;
  }
  const pidRaw = readLegacyLockField(lockDir, 'pid');
  const leasePath = readLegacyLockField(lockDir, 'lease-path');
  const runId = readLegacyLockField(lockDir, 'run-id');
  const metadata = {
    version: 0,
    host: readLegacyLockField(lockDir, 'host'),
    identity: readLegacyLockField(lockDir, 'identity'),
    leasePath,
    pid: pidRaw ? Number(pidRaw) : null,
    runId,
    startedAt: readLegacyLockField(lockDir, 'started-at'),
  };
  return Object.values(metadata).some((value) => value !== null) ? metadata : null;
}

function archiveLock(commonDir, lockName, metadata, reason, archivedAt = new Date()) {
  const target = path.join(
    ensureDirectory(lockArchiveDirectory(commonDir)),
    `${archivedAt.toISOString().replaceAll(':', '-')}-${lockName}.json`,
  );
  atomicWriteJson(target, {
    archivedAt: nowIso(archivedAt),
    lockName,
    metadata,
    reason,
  });
  return target;
}

export function acquireLock(
  commonDir,
  {
    identity,
    leasePath,
    lockName,
    now = Date.now(),
    host = os.hostname(),
    pid = process.pid,
    runId,
    staleAfterMs = DEFAULT_STALE_AFTER_SECONDS * 1000,
    processProbe = processAlive,
  },
) {
  const root = ensureDirectory(lockRootDirectory(commonDir));
  const lockDir = path.join(root, `${lockName}.lock`);
  const metadata = {
    version: 1,
    host,
    identity,
    leasePath,
    lockName,
    pid,
    runId,
    startedAt: new Date(now).toISOString(),
  };

  try {
    mkdirSync(lockDir);
    atomicWriteJson(path.join(lockDir, 'metadata.json'), metadata);
    return lockDir;
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }

  if (existsSync(lockDir)) {
    const existingMetadata = readLockMetadata(lockDir);
    const existingLease = existingMetadata?.leasePath ? readJsonIfExists(existingMetadata.leasePath) : null;
    const existingLeaseState = evaluateLeaseState(existingLease, {
      host,
      now,
      processProbe,
      staleAfterMs,
    });
    const existingPidAlive =
      existingMetadata?.host === host && Number.isInteger(existingMetadata?.pid)
        ? processProbe(existingMetadata.pid)
        : null;
    const activelyOwned = existingLeaseState.state === 'active' || (!existingLease && existingPidAlive === true);

    if (activelyOwned) {
      throw new Error(
        `Another Ralph Loop owns ${identity} (host=${existingMetadata?.host ?? 'unknown'}, pid=${
          existingMetadata?.pid ?? 'unknown'
        }, run=${existingMetadata?.runId ?? 'unknown'}).`,
      );
    }

    const archivedLockDirectory = path.join(
      ensureDirectory(lockArchiveDirectory(commonDir)),
      `${new Date(now).toISOString().replaceAll(':', '-')}-${process.pid}-${lockName}.lock`,
    );
    try {
      renameSync(lockDir, archivedLockDirectory);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Another Ralph Loop changed ${identity} while stale state was being recovered.`);
      }
      throw error;
    }
    archiveLock(commonDir, lockName, existingMetadata, existingLeaseState.state === 'missing' ? 'orphaned' : 'stale');
  }

  try {
    mkdirSync(lockDir);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Another Ralph Loop acquired ${identity} while stale state was being recovered.`);
    }
    throw error;
  }
  atomicWriteJson(path.join(lockDir, 'metadata.json'), metadata);
  return lockDir;
}

export function releaseLock(lockDir) {
  rmSync(lockDir, { force: true, recursive: true });
}

export function releaseLocks(lockDirs) {
  for (const lockDir of lockDirs) {
    releaseLock(lockDir);
  }
}

export function archiveRuntimeState(commonDir, issueNumber, { checkpoint, lease, reason, now = new Date() }) {
  const archivedAt = nowIso(now);
  const runId = lease?.runId ?? checkpoint?.runId ?? 'unknown-run';
  const archivePath = path.join(
    ensureDirectory(archiveDirectory(commonDir, issueNumber)),
    `${archivedAt.replaceAll(':', '-')}-${runId}.json`,
  );
  atomicWriteJson(archivePath, {
    archivedAt,
    checkpoint,
    lease,
    reason,
  });
  return archivePath;
}

export function assessRecovery({ leaseEvaluation, worktreeDirty }) {
  if (leaseEvaluation.state === 'active') {
    return { action: 'refuse-active' };
  }
  if (worktreeDirty && ['dead', 'stale', 'stopped'].includes(leaseEvaluation.state)) {
    return { action: 'dirty-blocked' };
  }
  if (['dead', 'stale', 'stopped'].includes(leaseEvaluation.state)) {
    return { action: 'archive-and-recover' };
  }
  return { action: 'start-fresh' };
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RalphRuntimeState {
  constructor({ commonDir, issueNumber, identity, now = () => new Date() }) {
    this.commonDir = commonDir;
    this.issueNumber = issueNumber;
    this.identity = identity;
    this.now = now;
    this.leasePath = leaseFilePath(commonDir, issueNumber);
    this.checkpointPath = checkpointFilePath(commonDir, issueNumber);
    this.lease = null;
    this.checkpoint = readJsonIfExists(this.checkpointPath);
  }

  startLease({ deadlineAt = null, lastKnownHead = null, phase = 'preflight' }) {
    const startedAt = nowIso(this.now());
    this.lease = {
      version: 1,
      ...this.identity,
      childPid: null,
      deadlineAt,
      iteration: 0,
      lastHeartbeatAt: startedAt,
      lastKnownHead,
      phase,
      pid: process.pid,
      host: os.hostname(),
      startedAt,
      stop: null,
    };
    atomicWriteJson(this.leasePath, this.lease);
    return this.lease;
  }

  updateLease(patch = {}) {
    if (!this.lease) {
      this.lease = readJsonIfExists(this.leasePath) ?? {
        version: 1,
        ...this.identity,
        host: os.hostname(),
        pid: process.pid,
        startedAt: nowIso(this.now()),
      };
    }
    this.lease = mergeRecord(this.lease, patch);
    this.lease.lastHeartbeatAt = nowIso(this.now());
    atomicWriteJson(this.leasePath, this.lease);
    return this.lease;
  }

  stopLease({ childPid = null, lastKnownHead = null, outcome, reason }) {
    return this.updateLease({
      childPid,
      lastKnownHead,
      phase: 'stop',
      stop: {
        at: nowIso(this.now()),
        outcome,
        reason,
      },
    });
  }

  updateCheckpoint(patch = {}) {
    this.checkpoint = mergeRecord(this.checkpoint, patch);
    this.checkpoint = {
      version: 1,
      ...this.identity,
      ...this.checkpoint,
      updatedAt: nowIso(this.now()),
    };
    atomicWriteJson(this.checkpointPath, this.checkpoint);
    return this.checkpoint;
  }
}
