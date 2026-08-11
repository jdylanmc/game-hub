#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function tokenLookupEnvironment(baseEnvironment) {
  return {
    ...baseEnvironment,
    GH_TOKEN: '',
    GITHUB_TOKEN: '',
  };
}

function resolveStoredToken(owner, baseEnvironment) {
  return execFileSync('gh', ['auth', 'token', '--hostname', 'github.com', '--user', owner], {
    encoding: 'utf8',
    env: tokenLookupEnvironment(baseEnvironment),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function createIsolatedGitHubEnvironment(
  owner,
  { baseEnvironment = process.env, tokenResolver = resolveStoredToken } = {},
) {
  if (typeof owner !== 'string' || !owner) {
    throw new Error('A GitHub owner is required for isolated authentication.');
  }
  let token;
  try {
    token = tokenResolver(owner, baseEnvironment);
  } catch {
    token = baseEnvironment.GH_TOKEN || baseEnvironment.GITHUB_TOKEN;
  }
  if (typeof token !== 'string' || !token) {
    throw new Error(`No stored GitHub credential is available for ${owner}.`);
  }
  return {
    ...baseEnvironment,
    GH_TOKEN: token,
  };
}

export function verifyGitHubIdentity(owner, environment, cwd = process.cwd()) {
  const login = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
    cwd,
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (login !== owner) {
    throw new Error(`Isolated GitHub credential resolves to ${login}, not ${owner}.`);
  }
  return login;
}
