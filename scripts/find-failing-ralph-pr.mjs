import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const failingStates = new Set([
  'ACTION_REQUIRED',
  'CANCELLED',
  'ERROR',
  'FAILURE',
  'STALE',
  'STARTUP_FAILURE',
  'TIMED_OUT',
]);
const issueMarkerPattern = /<!--\s*ralph-issue:(\d+)\s*-->/;

function checkState(check) {
  return check.conclusion ?? check.state ?? '';
}

function isBlockingPullRequest(pullRequest) {
  const checks = pullRequest.statusCheckRollup ?? [];
  return checks.length === 0 || checks.some((check) => failingStates.has(checkState(check)));
}

function issueNumberFromPullRequest(pullRequest) {
  const match = issueMarkerPattern.exec(pullRequest.body ?? '');
  return match ? Number(match[1]) : null;
}

export function selectFailingRalphPullRequest(pullRequests, memories, repoNameWithOwner) {
  const blockingPullRequests = pullRequests
    .filter((pullRequest) => pullRequest.headRefName?.startsWith('ralph/') && isBlockingPullRequest(pullRequest))
    .sort((left, right) => left.number - right.number);

  if (blockingPullRequests.length === 0) {
    return { status: 'none' };
  }

  const pullRequest = blockingPullRequests[0];
  const issueNumber = issueNumberFromPullRequest(pullRequest);
  if (issueNumber === null) {
    throw new Error(`Blocking Ralph pull request #${pullRequest.number} has no ralph-issue identity marker.`);
  }
  if (!pullRequest.isDraft) {
    throw new Error(
      `Blocking Ralph pull request #${pullRequest.number} is not a draft; a human must decide how to proceed.`,
    );
  }

  const matches = memories.filter(
    ({ plan }) =>
      plan.repoNameWithOwner === repoNameWithOwner &&
      plan.issueNumber === issueNumber &&
      plan.branchName === pullRequest.headRefName &&
      plan.baseBranch === pullRequest.baseRefName,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Blocking Ralph pull request #${pullRequest.number} maps to ${matches.length} matching memories; expected exactly one.`,
    );
  }

  const [{ memoryDir, plan }] = matches;
  return {
    status: 'failing',
    repoNameWithOwner,
    issueNumber,
    issueUrl: plan.issueUrl,
    branchName: plan.branchName,
    baseBranch: plan.baseBranch,
    memoryDir,
    pullRequestNumber: pullRequest.number,
    pullRequestUrl: pullRequest.url,
  };
}

async function loadMemories(rootDirectory) {
  const memoriesRoot = path.join(rootDirectory, 'docs', 'memories');
  const entries = await fs.readdir(memoriesRoot, { withFileTypes: true });
  const memories = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const memoryDir = path.posix.join('docs', 'memories', entry.name);
    const planPath = path.join(rootDirectory, memoryDir, 'plan.json');
    try {
      const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
      memories.push({ memoryDir, plan });
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw new Error(`Could not load ${memoryDir}/plan.json: ${error.message}`, {
        cause: error,
      });
    }
  }

  return memories;
}

async function main() {
  const repoNameWithOwner = process.argv[2] ?? 'jdylanmc/game-hub';
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pullRequests = JSON.parse(
    execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        repoNameWithOwner,
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'number,url,body,isDraft,headRefName,baseRefName,statusCheckRollup',
      ],
      { encoding: 'utf8' },
    ),
  );
  const memories = await loadMemories(rootDirectory);
  const result = selectFailingRalphPullRequest(pullRequests, memories, repoNameWithOwner);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
