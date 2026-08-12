#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadRequiredChecks(repoRoot = root) {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/ralph-required-checks.json'), 'utf8'));
  if (
    !isObject(config) ||
    config.version !== '1.0.0' ||
    !Array.isArray(config.requiredChecks) ||
    config.requiredChecks.length < 1 ||
    config.requiredChecks.some((name) => typeof name !== 'string' || name.length < 1) ||
    new Set(config.requiredChecks).size !== config.requiredChecks.length
  ) {
    throw new Error('Required pull-request check configuration is malformed.');
  }
  return config.requiredChecks;
}

function checkName(check) {
  return check.name ?? check.context ?? '';
}

function successfulCheck(check) {
  if (check.__typename === 'StatusContext' || 'state' in check) {
    return check.state === 'SUCCESS';
  }
  return check.status === 'COMPLETED' && check.conclusion === 'SUCCESS';
}

function validateRequiredPullRequestGates(value, expectedHeadSha, requiredChecks = loadRequiredChecks()) {
  const errors = [];
  if (!isObject(value) || !Array.isArray(value.statusCheckRollup)) {
    return { valid: false, errors: ['Pull-request check response is malformed.'] };
  }
  if (!/^[a-f0-9]{40}$/.test(expectedHeadSha) || value.headRefOid !== expectedHeadSha) {
    errors.push('Pull-request check response is stale or bound to another head SHA.');
  }
  for (const requiredCheck of requiredChecks) {
    const matches = value.statusCheckRollup.filter((check) => isObject(check) && checkName(check) === requiredCheck);
    if (matches.length !== 1) {
      errors.push(`Required check must appear exactly once: ${requiredCheck}`);
    } else if (!successfulCheck(matches[0])) {
      errors.push(`Required check is not successful: ${requiredCheck}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--expected-head-sha') {
    throw new Error('Usage: check-required-pull-request-gates.mjs --expected-head-sha <sha>');
  }
  return argv[1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const expectedHeadSha = parseArguments(process.argv.slice(2));
    const value = JSON.parse(fs.readFileSync(0, 'utf8'));
    const result = validateRequiredPullRequestGates(value, expectedHeadSha);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.valid ? 0 : 3;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

export { loadRequiredChecks, validateRequiredPullRequestGates };
