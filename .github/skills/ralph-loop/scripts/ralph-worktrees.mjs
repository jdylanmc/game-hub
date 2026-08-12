#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function git(repoRoot, ...args) {
  return run('git', args, { cwd: repoRoot });
}

export function repositoryIdentity(repoRoot) {
  const root = git(repoRoot, 'rev-parse', '--show-toplevel');
  const commonDirRaw = git(root, 'rev-parse', '--git-common-dir');
  const commonDir = path.resolve(root, commonDirRaw);
  const primaryWorktree = path.dirname(commonDir);
  return {
    root,
    commonDir,
    primaryWorktree,
    worktreeRoot: path.join(path.dirname(primaryWorktree), `${path.basename(primaryWorktree)}-worktrees`),
  };
}

export function deterministicWorktreePath(repoRoot, issueNumber) {
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error('issueNumber must be a positive integer');
  }
  return path.join(repositoryIdentity(repoRoot).worktreeRoot, `issue-${issueNumber}`);
}

export function parseWorktrees(repoRoot) {
  const output = git(repoRoot, 'worktree', 'list', '--porcelain');
  if (!output) return [];

  return output.split('\n\n').map((block) => {
    const entry = {};
    for (const line of block.split('\n')) {
      const [key, ...rest] = line.split(' ');
      entry[key] = rest.join(' ');
    }
    return {
      path: entry.worktree,
      branch: entry.branch?.replace('refs/heads/', '') ?? null,
      head: entry.HEAD,
    };
  });
}

export function remoteBranchExists(repoRoot, branchName) {
  try {
    run('git', ['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${branchName}`], {
      cwd: repoRoot,
    });
    return true;
  } catch {
    return false;
  }
}

export function verifyRemoteBranch(repoRoot, branchName) {
  if (!remoteBranchExists(repoRoot, branchName)) return;
  git(repoRoot, 'fetch', '--quiet', 'origin', `${branchName}:refs/remotes/origin/${branchName}`);
  try {
    git(repoRoot, 'merge-base', '--is-ancestor', `origin/${branchName}`, branchName);
  } catch {
    throw new Error(`Local branch ${branchName} is behind or diverged from origin/${branchName}.`);
  }
}

export function assertCleanWorktree(worktreePath) {
  const status = git(worktreePath, 'status', '--porcelain');
  if (status) {
    throw new Error(`Worktree ${worktreePath} is dirty; preserve it for inspection.`);
  }
}

export function prepareWorktree({ repoRoot, issueNumber, branchName, baseBranch = 'main' }) {
  const identity = repositoryIdentity(repoRoot);
  const targetPath = deterministicWorktreePath(repoRoot, issueNumber);
  const worktrees = parseWorktrees(repoRoot);
  const atTarget = worktrees.find((entry) => path.resolve(entry.path) === targetPath);
  const withBranch = worktrees.find((entry) => entry.branch === branchName);

  if (withBranch && path.resolve(withBranch.path) !== targetPath) {
    throw new Error(`Branch ${branchName} is already owned by ${withBranch.path}.`);
  }
  if (atTarget && atTarget.branch !== branchName) {
    throw new Error(
      `Deterministic worktree ${targetPath} is already assigned to ${atTarget.branch ?? 'detached HEAD'}.`,
    );
  }
  if (!atTarget && existsSync(targetPath)) {
    throw new Error(`Deterministic worktree path already exists outside git: ${targetPath}.`);
  }

  git(repoRoot, 'fetch', '--quiet', 'origin', `${baseBranch}:refs/remotes/origin/${baseBranch}`);

  if (!atTarget) {
    const localBranchExists = (() => {
      try {
        git(repoRoot, 'show-ref', '--verify', '--quiet', `refs/heads/${branchName}`);
        return true;
      } catch {
        return false;
      }
    })();

    if (localBranchExists) {
      verifyRemoteBranch(repoRoot, branchName);
      git(repoRoot, 'worktree', 'add', targetPath, branchName);
    } else if (remoteBranchExists(repoRoot, branchName)) {
      git(repoRoot, 'fetch', '--quiet', 'origin', `${branchName}:refs/remotes/origin/${branchName}`);
      git(repoRoot, 'worktree', 'add', '--track', '-b', branchName, targetPath, `origin/${branchName}`);
    } else {
      git(repoRoot, 'worktree', 'add', '-b', branchName, targetPath, `origin/${baseBranch}`);
    }
  }

  assertCleanWorktree(targetPath);
  verifyRemoteBranch(repoRoot, branchName);
  return { ...identity, worktreePath: targetPath };
}

export function loadPlan(worktreePath, memoryDir) {
  const requestedPlanPath = path.resolve(worktreePath, memoryDir, 'plan.json');
  if (!existsSync(requestedPlanPath)) {
    throw new Error(`Missing safe Ralph plan at ${requestedPlanPath}.`);
  }
  const planPath = realpathSync(requestedPlanPath);
  const memoryRoot = realpathSync(path.resolve(worktreePath, 'docs/memories'));
  if (!planPath.startsWith(`${memoryRoot}${path.sep}`) || !existsSync(planPath)) {
    throw new Error(`Missing safe Ralph plan at ${planPath}.`);
  }
  return JSON.parse(readFileSync(planPath, 'utf8'));
}

export function normalizeScope(scope) {
  if (typeof scope !== 'string' || !scope.trim()) {
    throw new Error('Change scopes must be non-empty repository-relative paths.');
  }
  const portable = scope.trim().replaceAll('\\', '/');
  if (/[*?[\]{}]/.test(portable)) {
    throw new Error(`Change scopes must be literal path prefixes: ${scope}`);
  }
  const normalized = path.posix.normalize(portable).replace(/^\.\/|\/$/g, '');
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    path.posix.isAbsolute(portable) ||
    /^[A-Za-z]:\//.test(portable)
  ) {
    throw new Error(`Unsafe change scope: ${scope}`);
  }
  return normalized || '.';
}

export function scopesOverlap(left, right) {
  const a = normalizeScope(left);
  const b = normalizeScope(right);
  return a === '.' || b === '.' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function validateLoops(loops) {
  const issues = new Set();
  const branches = new Set();
  const worktrees = new Set();

  for (const loop of loops) {
    if (!Number.isInteger(loop.issueNumber) || loop.issueNumber < 1) {
      throw new Error('Every loop needs a positive integer issueNumber.');
    }
    if (!Number.isFinite(loop.priority)) {
      throw new Error(`Issue #${loop.issueNumber} has an invalid priority.`);
    }
    if (
      !Array.isArray(loop.dependencies) ||
      loop.dependencies.some(
        (dependency) => !Number.isInteger(dependency) || dependency < 1 || dependency === loop.issueNumber,
      )
    ) {
      throw new Error(`Issue #${loop.issueNumber} has invalid dependencies.`);
    }
    if (!Array.isArray(loop.changeScopes) || loop.changeScopes.length === 0) {
      throw new Error(`Issue #${loop.issueNumber} must declare change scopes.`);
    }
    loop.changeScopes.forEach(normalizeScope);
    if (issues.has(loop.issueNumber)) {
      throw new Error(`Issue #${loop.issueNumber} has duplicate ownership.`);
    }
    if (branches.has(loop.branchName)) {
      throw new Error(`Branch ${loop.branchName} has duplicate ownership.`);
    }
    if (worktrees.has(loop.worktreePath)) {
      throw new Error(`Worktree ${loop.worktreePath} has duplicate ownership.`);
    }
    issues.add(loop.issueNumber);
    branches.add(loop.branchName);
    worktrees.add(loop.worktreePath);
  }

  const loopsByIssue = new Map(loops.map((loop) => [loop.issueNumber, loop]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (issueNumber) => {
    if (visiting.has(issueNumber)) {
      throw new Error(`Issue dependency cycle includes #${issueNumber}.`);
    }
    if (visited.has(issueNumber)) return;
    visiting.add(issueNumber);
    const loop = loopsByIssue.get(issueNumber);
    for (const dependency of loop?.dependencies ?? []) {
      if (loopsByIssue.has(dependency)) visit(dependency);
    }
    visiting.delete(issueNumber);
    visited.add(issueNumber);
  };
  loops.forEach((loop) => visit(loop.issueNumber));
}

export function scheduleLoops(loops, dependencyStates = {}) {
  validateLoops(loops);
  const eligible = [];
  const blocked = [];

  for (const loop of loops) {
    const unmet = loop.dependencies.filter((issueNumber) => dependencyStates[issueNumber] !== 'merged');
    if (unmet.length) {
      blocked.push({ ...loop, unmetDependencies: unmet });
    } else {
      eligible.push(loop);
    }
  }

  eligible.sort((left, right) => left.priority - right.priority || left.issueNumber - right.issueNumber);

  for (let index = 0; index < eligible.length; index += 1) {
    for (let other = index + 1; other < eligible.length; other += 1) {
      for (const left of eligible[index].changeScopes) {
        for (const right of eligible[other].changeScopes) {
          if (scopesOverlap(left, right)) {
            throw new Error(
              `Unsafe overlap: issue #${eligible[index].issueNumber} scope '${left}' conflicts with issue #${eligible[other].issueNumber} scope '${right}'.`,
            );
          }
        }
      }
    }
  }
  return { eligible, blocked };
}
