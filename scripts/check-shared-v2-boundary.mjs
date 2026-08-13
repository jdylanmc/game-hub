#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function checkSharedV2Boundary(repoRoot = root, manifestValue) {
  const manifest =
    manifestValue ??
    JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/shared-v2/manifest.json'), 'utf8'));
  const errors = [];
  if (
    !manifest ||
    manifest.manifestVersion !== '2.0.0' ||
    manifest.state !== 'dormant-bootstrap-boundary' ||
    manifest.activationIssue !== 58 ||
    manifest.activeReviewerContractVersion !== '1.0.0' ||
    manifest.v2ContractVersion !== '2.0.0' ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 10
  ) {
    return { valid: false, errors: ['Shared v2 manifest identity is invalid.'] };
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      entry.path.startsWith('/') ||
      entry.path.includes('..') ||
      seen.has(entry.path)
    ) {
      errors.push('Shared v2 manifest file entry is invalid.');
      continue;
    }
    seen.add(entry.path);
    try {
      if (sha256(fs.readFileSync(path.join(repoRoot, entry.path))) !== entry.sha256) {
        errors.push(`Shared v2 manifest digest mismatch: ${entry.path}`);
      }
    } catch {
      errors.push(`Shared v2 manifest file is missing: ${entry.path}`);
    }
  }
  const activeSchema = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/schema.json'), 'utf8'),
  );
  const activePolicy = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/policy.json'), 'utf8'),
  );
  const activeEngine = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/reviewer-engine.json'), 'utf8'),
  );
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/adversarial-review.yml'), 'utf8');
  if (
    activeSchema.version !== '1.0.0' ||
    activePolicy.version !== '1.0.0' ||
    activeEngine.version !== '1.0.1' ||
    workflow.includes('shared-v2')
  ) {
    errors.push('Active v1 reviewer is not isolated from the dormant v2 boundary.');
  }
  return { valid: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSharedV2Boundary();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.valid ? 0 : 3;
}

export { checkSharedV2Boundary };
