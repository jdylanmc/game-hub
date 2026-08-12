#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlan, repositoryIdentity, run } from './ralph-worktrees.mjs';
import { createIsolatedGitHubEnvironment, verifyGitHubIdentity } from './ralph-github-auth.mjs';
import {
  checkpointFilePath,
  DEFAULT_STALE_AFTER_SECONDS,
  evaluateLeaseState,
  leaseFilePath,
  parseGitStatusPorcelain,
  readJsonIfExists,
} from './ralph-runtime-state.mjs';

export const DEFAULT_REQUIRED_STATUS_CHECKS = ['Continuous integration'];

const failureStates = new Set([
  'ACTION_REQUIRED',
  'CANCELLED',
  'ERROR',
  'FAILURE',
  'NEUTRAL',
  'SKIPPED',
  'STALE',
  'STARTUP_FAILURE',
  'TIMED_OUT',
]);
const pendingStates = new Set(['EXPECTED', 'IN_PROGRESS', 'PENDING', 'QUEUED', 'REQUESTED', 'WAITING']);
const successStates = new Set(['SUCCESS', 'SUCCESSFUL']);

function readOption(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

export function normalizeCheckName(check) {
  return check.name ?? check.context ?? check.displayName ?? check.title ?? check.workflowName ?? '';
}

export function normalizeCheckState(check) {
  const state = check.conclusion ?? check.state ?? check.status ?? '';
  if (failureStates.has(state)) return 'failure';
  if (pendingStates.has(state)) return 'pending';
  if (successStates.has(state)) return 'success';
  return 'unknown';
}

export function requiredStatusChecksFromPlan(plan) {
  const publication = plan.publication ?? {};
  return {
    adversarialStatusChecks: Array.isArray(publication.adversarialStatusChecks)
      ? publication.adversarialStatusChecks
      : [],
    requiredStatusChecks:
      Array.isArray(publication.requiredStatusChecks) && publication.requiredStatusChecks.length > 0
        ? publication.requiredStatusChecks
        : DEFAULT_REQUIRED_STATUS_CHECKS,
  };
}

export function summarizeRequiredChecks(checks, requiredNames) {
  if (!requiredNames.length) {
    return {
      duplicates: [],
      failure: [],
      missing: [],
      pending: [],
      requiredNames,
      state: 'not-required',
      success: [],
    };
  }

  const byName = new Map();
  const occurrences = new Map();
  for (const check of checks) {
    const name = normalizeCheckName(check);
    if (!name) continue;
    occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
    const state = normalizeCheckState(check);
    const current = byName.get(name);
    const currentRank = current === 'failure' ? 3 : current === 'pending' ? 2 : current === 'success' ? 1 : 0;
    const nextRank = state === 'failure' ? 3 : state === 'pending' ? 2 : state === 'success' ? 1 : 0;
    if (nextRank >= currentRank) {
      byName.set(name, state);
    }
  }

  const missing = [];
  const pending = [];
  const failure = [];
  const success = [];
  const duplicates = [];

  for (const requiredName of requiredNames) {
    if ((occurrences.get(requiredName) ?? 0) > 1) {
      duplicates.push(requiredName);
      continue;
    }
    const state = byName.get(requiredName);
    if (state === 'failure') {
      failure.push(requiredName);
    } else if (state === 'pending') {
      pending.push(requiredName);
    } else if (state === 'success') {
      success.push(requiredName);
    } else {
      missing.push(requiredName);
    }
  }

  return {
    duplicates,
    failure,
    missing,
    pending,
    requiredNames,
    state:
      duplicates.length || failure.length
        ? 'failure'
        : pending.length
          ? 'pending'
          : missing.length
            ? 'missing'
            : 'success',
    success,
  };
}

function nextStoryId(plan) {
  const completed = new Set(plan.stories.filter((story) => story.passes).map((story) => story.id));
  const orderedStories = [...plan.stories].sort(
    (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
  );
  return (
    orderedStories.find(
      (story) => !story.passes && (story.dependencies ?? []).every((dependency) => completed.has(dependency)),
    )?.id ?? null
  );
}

function pullRequestState(pullRequest) {
  if (!pullRequest) return 'none';
  return `${pullRequest.state.toLowerCase()}:${pullRequest.isDraft ? 'draft' : 'ready'}`;
}

function exactHeadPublished(snapshot) {
  return Boolean(
    snapshot.localCommit &&
    snapshot.remoteCommit &&
    snapshot.localCommit === snapshot.remoteCommit &&
    (!snapshot.pullRequestHeadSha || snapshot.pullRequestHeadSha === snapshot.localCommit),
  );
}

export function classifyLoopStatus(snapshot) {
  const checkpointHint = snapshot.nextAction ?? null;
  const outcome = snapshot.outcomeReason;

  if (snapshot.leaseState === 'active') {
    return {
      nextAction: 'Wait for the active runner heartbeat or inspect its latest iteration log before intervening.',
      status: 'running',
    };
  }

  if (snapshot.worktreeDirty) {
    return {
      nextAction: `Inspect the dirty files and latest iteration log, then commit or revert them before rerunning Ralph from ${
        snapshot.lastVerifiedHead ?? 'the last verified checkpoint'
      }.`,
      status: 'dirty-blocked',
    };
  }

  if (snapshot.leaseState === 'stale' || snapshot.leaseState === 'dead') {
    return {
      nextAction:
        checkpointHint ??
        `Archive the stale lease and rerun Ralph from ${snapshot.lastVerifiedHead ?? 'the last verified checkpoint'}.`,
      status: 'stale',
    };
  }

  if (outcome === 'timed-out') {
    return {
      nextAction:
        checkpointHint ??
        `Rerun Ralph to resume from ${snapshot.lastVerifiedHead ?? 'the last verified checkpoint'} after reviewing the timeout.`,
      status: 'timed-out',
    };
  }

  if (outcome === 'cancelled') {
    return {
      nextAction:
        checkpointHint ??
        `Rerun Ralph to resume from ${snapshot.lastVerifiedHead ?? 'the last verified checkpoint'} after reviewing the cancellation.`,
      status: 'cancelled',
    };
  }

  if (snapshot.allStoriesPassed) {
    if (!exactHeadPublished(snapshot)) {
      return {
        nextAction:
          checkpointHint ??
          'Push the last verified head and update or create the draft pull request for that exact commit.',
        status: 'idle',
      };
    }
    if (snapshot.ciState !== 'success') {
      return {
        nextAction:
          checkpointHint ??
          'Resolve the required pull-request checks on the published head before considering the issue complete.',
        status: 'ci-blocked',
      };
    }
    if (!['not-required', 'success'].includes(snapshot.adversarialState)) {
      return {
        nextAction:
          checkpointHint ??
          'Publish or repair the required adversarial exact-head check before considering the issue complete.',
        status: 'adversarial-check-blocked',
      };
    }
    return {
      nextAction: 'Wait for human review and merge; the issue branch is published on the passing exact head.',
      status: 'complete',
    };
  }

  return {
    nextAction: checkpointHint ?? `Rerun Ralph to continue story ${snapshot.nextStoryId ?? 'planning'}.`,
    status: 'idle',
  };
}

export function collectLoopSnapshot(
  loop,
  { githubEnvironment = process.env, now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_SECONDS * 1000 } = {},
) {
  const snapshot = {
    adversarialState: 'not-required',
    allStoriesPassed: false,
    branchName: loop.branchName,
    checkpointUpdatedAt: null,
    ciState: 'none',
    dirtyFiles: [],
    dirtyStatusLines: [],
    issueNumber: loop.issueNumber,
    lastHeartbeatAt: null,
    lastPublishedCommit: null,
    lastVerifiedHead: null,
    leaseState: 'missing',
    localCommit: null,
    memoryDir: loop.memoryDir,
    monitorError: null,
    nextAction: null,
    nextStoryId: null,
    outcomeReason: null,
    passedStoryIds: [],
    phase: null,
    pullRequestHeadSha: null,
    pullRequestNumber: null,
    pullRequestState: 'none',
    pullRequestUrl: null,
    remoteCommit: null,
    runId: null,
    startedAt: null,
    totalStories: 0,
    worktreeDirty: false,
    worktreePath: loop.worktreePath,
  };

  try {
    const plan = loadPlan(loop.worktreePath, loop.memoryDir);
    const { commonDir } = repositoryIdentity(loop.worktreePath);
    const lease = readJsonIfExists(leaseFilePath(commonDir, loop.issueNumber));
    const checkpoint = readJsonIfExists(checkpointFilePath(commonDir, loop.issueNumber));
    const leaseEvaluation = evaluateLeaseState(lease, { now, staleAfterMs });
    const requiredChecks = requiredStatusChecksFromPlan(plan);

    snapshot.allStoriesPassed = plan.stories.every((story) => story.passes);
    snapshot.passedStoryIds = plan.stories.filter((story) => story.passes).map((story) => story.id);
    snapshot.totalStories = plan.stories.length;
    snapshot.nextStoryId = nextStoryId(plan);
    snapshot.leaseState = leaseEvaluation.state;
    snapshot.startedAt = lease?.startedAt ?? null;
    snapshot.lastHeartbeatAt = lease?.lastHeartbeatAt ?? null;
    snapshot.phase = lease?.phase ?? checkpoint?.phase ?? null;
    snapshot.runId = lease?.runId ?? checkpoint?.runId ?? null;
    snapshot.outcomeReason = lease?.stop?.outcome ?? null;
    snapshot.lastPublishedCommit = checkpoint?.lastPublishedCommit ?? null;
    snapshot.lastVerifiedHead = checkpoint?.lastVerifiedHead ?? null;
    snapshot.nextAction = checkpoint?.nextResumableAction ?? null;
    snapshot.checkpointUpdatedAt = checkpoint?.updatedAt ?? null;

    snapshot.localCommit = run('git', ['rev-parse', 'HEAD'], { cwd: loop.worktreePath });
    snapshot.remoteCommit = (() => {
      const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${loop.branchName}`], {
        cwd: loop.worktreePath,
      });
      return remote ? remote.split(/\s+/)[0] : null;
    })();

    const statusOutput = run('git', ['status', '--porcelain'], { cwd: loop.worktreePath });
    snapshot.dirtyStatusLines = statusOutput ? statusOutput.split(/\r?\n/).filter(Boolean) : [];
    snapshot.dirtyFiles = parseGitStatusPorcelain(statusOutput);
    snapshot.worktreeDirty = snapshot.dirtyFiles.length > 0;

    const pullRequests = JSON.parse(
      run(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          plan.repoNameWithOwner,
          '--head',
          loop.branchName,
          '--state',
          'all',
          '--json',
          'number,url,state,isDraft',
        ],
        { cwd: loop.worktreePath, env: githubEnvironment },
      ),
    );
    if (pullRequests.length > 1) {
      throw new Error(`Multiple pull requests use branch ${loop.branchName}.`);
    }
    if (pullRequests.length === 1) {
      const detailedPullRequest = JSON.parse(
        run(
          'gh',
          [
            'pr',
            'view',
            String(pullRequests[0].number),
            '--repo',
            plan.repoNameWithOwner,
            '--json',
            'number,url,state,isDraft,headRefOid,statusCheckRollup',
          ],
          { cwd: loop.worktreePath, env: githubEnvironment },
        ),
      );
      const checks = detailedPullRequest.statusCheckRollup ?? [];
      const ciSummary = summarizeRequiredChecks(checks, requiredChecks.requiredStatusChecks);
      const adversarialSummary = summarizeRequiredChecks(checks, requiredChecks.adversarialStatusChecks);
      snapshot.ciState = ciSummary.state === 'not-required' ? 'none' : ciSummary.state;
      snapshot.adversarialState = adversarialSummary.state;
      snapshot.pullRequestNumber = detailedPullRequest.number;
      snapshot.pullRequestHeadSha = detailedPullRequest.headRefOid ?? null;
      snapshot.pullRequestState = pullRequestState(detailedPullRequest);
      snapshot.pullRequestUrl = detailedPullRequest.url;
      snapshot.requiredStatusChecks = ciSummary;
      snapshot.adversarialStatusChecks = adversarialSummary;
    } else {
      snapshot.ciState = 'none';
      snapshot.adversarialState = requiredChecks.adversarialStatusChecks.length ? 'missing' : 'not-required';
      snapshot.requiredStatusChecks = summarizeRequiredChecks([], requiredChecks.requiredStatusChecks);
      snapshot.adversarialStatusChecks = summarizeRequiredChecks([], requiredChecks.adversarialStatusChecks);
    }

    const classification = classifyLoopStatus(snapshot);
    snapshot.status = classification.status;
    snapshot.nextAction = classification.nextAction;
  } catch (error) {
    snapshot.monitorError = error.message;
    snapshot.status = snapshot.worktreeDirty ? 'dirty-blocked' : (snapshot.status ?? 'idle');
  }

  return snapshot;
}

export function formatLoopStatus(snapshot) {
  const lines = [
    `Status: ${snapshot.status}`,
    `Issue: #${snapshot.issueNumber}`,
    `Branch: ${snapshot.branchName}`,
    `Phase: ${snapshot.phase ?? 'none'}`,
  ];

  if (snapshot.pullRequestUrl) {
    lines.push(`Pull request: ${snapshot.pullRequestUrl} (${snapshot.pullRequestState})`);
  }
  if (snapshot.startedAt) {
    lines.push(`Started: ${snapshot.startedAt}`);
  }
  if (snapshot.lastHeartbeatAt) {
    lines.push(`Last heartbeat: ${snapshot.lastHeartbeatAt}`);
  }
  if (snapshot.localCommit) {
    lines.push(`Local HEAD: ${snapshot.localCommit}`);
  }
  if (snapshot.lastPublishedCommit) {
    lines.push(`Last published commit: ${snapshot.lastPublishedCommit}`);
  }
  if (snapshot.lastVerifiedHead) {
    lines.push(`Last verified checkpoint: ${snapshot.lastVerifiedHead}`);
  }
  lines.push(`Stories passed: ${snapshot.passedStoryIds.length}/${snapshot.totalStories}`);
  lines.push(`Required checks: ${snapshot.ciState}`);
  if (snapshot.adversarialState !== 'not-required') {
    lines.push(`Adversarial checks: ${snapshot.adversarialState}`);
  }
  if (snapshot.outcomeReason) {
    lines.push(`Last outcome: ${snapshot.outcomeReason}`);
  }
  if (snapshot.worktreeDirty) {
    lines.push(`Dirty files: ${snapshot.dirtyFiles.join(', ')}`);
  }
  if (snapshot.monitorError) {
    lines.push(`Monitor warning: ${snapshot.monitorError}`);
  }
  lines.push(`Next action: ${snapshot.nextAction}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const memoryDir = readOption(args, '--memory-dir');
  if (!memoryDir) {
    throw new Error('Usage: ralph-status.mjs --memory-dir docs/memories/<issue-slug> [--json]');
  }
  const cwd = readOption(args, '--repo-root', process.cwd());
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  const plan = loadPlan(repoRoot, memoryDir);
  const owner = plan.repoNameWithOwner.split('/')[0];
  const githubEnvironment = createIsolatedGitHubEnvironment(owner);
  verifyGitHubIdentity(owner, githubEnvironment, repoRoot);
  const snapshot = collectLoopSnapshot(
    {
      branchName: plan.branchName,
      issueNumber: plan.issueNumber,
      memoryDir,
      worktreePath: repoRoot,
    },
    { githubEnvironment },
  );

  if (hasFlag(args, '--json')) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatLoopStatus(snapshot));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
