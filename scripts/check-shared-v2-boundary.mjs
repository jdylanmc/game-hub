#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memoryRoot = 'docs/memories/56-shared-adversarial-reviewer-platform';
const manifestPath = `${memoryRoot}/shared-v2-manifest.json`;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..')
  );
}

function checkSharedV2Boundary(repoRoot = root, manifestValue) {
  const manifest = manifestValue ?? JSON.parse(fs.readFileSync(path.join(repoRoot, manifestPath), 'utf8'));
  const errors = [];
  if (
    !manifest ||
    manifest.manifestVersion !== '2.0.0' ||
    manifest.state !== 'dormant-bootstrap-boundary' ||
    manifest.activationIssue !== 58 ||
    manifest.activeReviewerContractVersion !== '1.0.0' ||
    manifest.v2ContractVersion !== '2.0.0' ||
    typeof manifest.aggregateSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.aggregateSha256) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 30
  ) {
    return { valid: false, errors: ['Shared v2 manifest identity is invalid.'] };
  }

  const canonicalEntries = [];
  const sources = new Set();
  const destinations = new Set();
  for (const entry of manifest.files) {
    if (
      !entry ||
      !safePath(entry.sourcePath) ||
      !safePath(entry.destination) ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !entry.sourcePath.startsWith('shared-v2-source/') ||
      sources.has(entry.sourcePath) ||
      destinations.has(entry.destination)
    ) {
      errors.push('Shared v2 manifest file entry is invalid.');
      continue;
    }
    sources.add(entry.sourcePath);
    destinations.add(entry.destination);
    canonicalEntries.push({
      destination: entry.destination,
      sha256: entry.sha256,
      sourcePath: entry.sourcePath,
    });
    const sourcePath = path.join(repoRoot, memoryRoot, entry.sourcePath);
    try {
      if (fs.lstatSync(sourcePath).isSymbolicLink()) {
        errors.push(`Shared v2 source must not be a symlink: ${entry.sourcePath}`);
      } else if (sha256(fs.readFileSync(sourcePath)) !== entry.sha256) {
        errors.push(`Shared v2 source digest mismatch: ${entry.sourcePath}`);
      }
    } catch {
      errors.push(`Shared v2 source file is missing: ${entry.sourcePath}`);
    }
  }
  const aggregate = sha256(
    JSON.stringify(canonicalEntries.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))),
  );
  if (aggregate !== manifest.aggregateSha256) errors.push('Shared v2 aggregate manifest digest mismatch.');

  const sourceByDestination = new Map(manifest.files.map((entry) => [entry.destination, entry.sourcePath]));
  for (const entry of manifest.files.filter((item) => item.destination.endsWith('.ts'))) {
    const content = fs.readFileSync(path.join(repoRoot, memoryRoot, entry.sourcePath), 'utf8');
    for (const match of content.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const importedPath = match[1];
      const resolved = path.posix.normalize(
        path.posix.join(
          path.posix.dirname(entry.destination),
          importedPath.endsWith('.ts') ? importedPath : `${importedPath}.ts`,
        ),
      );
      if (!sourceByDestination.has(resolved)) {
        errors.push(`Shared v2 relative dependency is unmanifested: ${entry.destination} -> ${resolved}`);
      }
    }
    for (const match of content.matchAll(
      /['"]((?:config|\.github|docs|scripts)\/[A-Za-z0-9._/-]+\.(?:json|md|ts))['"]/g,
    )) {
      if (!sourceByDestination.has(match[1])) {
        errors.push(`Shared v2 file dependency is unmanifested: ${entry.destination} -> ${match[1]}`);
      }
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
