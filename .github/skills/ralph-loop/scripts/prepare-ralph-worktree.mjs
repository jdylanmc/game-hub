#!/usr/bin/env node

import { prepareWorktree } from './ralph-worktrees.mjs';

function fail(message) {
  console.error(`Ralph worktree error: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const readOption = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

try {
  const issueNumber = Number(readOption('--issue'));
  const branchName = readOption('--branch');
  const baseBranch = readOption('--base', 'main');
  const repoRoot = readOption('--repo-root', process.cwd());
  if (!issueNumber || !branchName) {
    fail('Usage: prepare-ralph-worktree.mjs --issue <number> --branch <name> [--base main] [--repo-root path]');
  }
  const result = prepareWorktree({ repoRoot, issueNumber, branchName, baseBranch });
  console.log(result.worktreePath);
} catch (error) {
  fail(error.message);
}
