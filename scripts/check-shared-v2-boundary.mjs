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

function canonicalManifestEntries(files, externalDependencies, activationOutputs) {
  return [
    ...files,
    ...externalDependencies,
    ...activationOutputs.map((entry) => ({ destination: entry.destination, generated: true })),
  ]
    .map((entry) => {
      const result = {
        destination: entry.destination,
        sha256: entry.sha256,
      };
      if (typeof entry.sourcePath === 'string') result.sourcePath = entry.sourcePath;
      if (entry.generated === true) result.generated = true;
      return result;
    })
    .sort((left, right) => left.destination.localeCompare(right.destination));
}

function collectJsonDependencyErrors(content, destination, sourceByDestination, digestByDestination) {
  const errors = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && (key.endsWith('File') || key.endsWith('Path'))) {
        if (!safePath(child) || !sourceByDestination.has(child)) {
          errors.push(`Shared v2 JSON dependency is unmanifested: ${destination} -> ${child}`);
        }
      }
      if (key.endsWith('ContentHash')) {
        const fileField = `${key.slice(0, -'ContentHash'.length)}File`;
        const file = value[fileField];
        if (typeof child !== 'string' || !/^[a-f0-9]{64}$/.test(child)) continue;
        if (
          (typeof file === 'string' && digestByDestination.get(file) !== child) ||
          (typeof file !== 'string' && ![...digestByDestination.values()].includes(child))
        ) {
          errors.push(`Shared v2 JSON content hash is inconsistent: ${destination} -> ${fileField}`);
        }
      }
      visit(child);
    }
  };
  visit(content);
  return errors;
}

function checkSharedV2Boundary(repoRoot = root, manifestValue) {
  const manifest = manifestValue ?? JSON.parse(fs.readFileSync(path.join(repoRoot, manifestPath), 'utf8'));
  const activationOutputs = Array.isArray(manifest?.activationOutputs) ? manifest.activationOutputs : [];
  const errors = [];
  if (
    !manifest ||
    manifest.manifestVersion !== '2.0.0' ||
    manifest.state !== 'dormant-post-prerequisite-boundary' ||
    manifest.activationIssue !== 58 ||
    manifest.activeReviewerContractVersion !== '1.0.0' ||
    manifest.v2ContractVersion !== '2.0.0' ||
    typeof manifest.aggregateSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.aggregateSha256) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 30 ||
    !Array.isArray(manifest.externalDependencies)
  ) {
    return { valid: false, errors: ['Shared v2 manifest identity is invalid.'] };
  }

  const sourceRoot = path.join(repoRoot, memoryRoot);
  const activeSchemaVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/schema.json'), 'utf8'),
  ).version;
  const sources = new Set();
  const destinations = new Set();
  const sourceByDestination = new Map();
  const digestByDestination = new Map();
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
      errors.push('Shared v2 manifest source entry is invalid.');
      continue;
    }
    sources.add(entry.sourcePath);
    destinations.add(entry.destination);
    sourceByDestination.set(entry.destination, entry.sourcePath);
    digestByDestination.set(entry.destination, entry.sha256);
    const sourcePath = path.join(sourceRoot, entry.sourcePath);
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
  for (const dependency of manifest.externalDependencies) {
    if (
      !dependency ||
      !safePath(dependency.destination) ||
      typeof dependency.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(dependency.sha256) ||
      destinations.has(dependency.destination)
    ) {
      errors.push('Shared v2 external dependency entry is invalid.');
      continue;
    }
    destinations.add(dependency.destination);
    sourceByDestination.set(dependency.destination, null);
    digestByDestination.set(dependency.destination, dependency.sha256);
    try {
      if (
        sha256(fs.readFileSync(path.join(repoRoot, dependency.destination))) !== dependency.sha256 &&
        !(activeSchemaVersion === '2.0.0' && dependency.destination === 'package.json')
      ) {
        errors.push(`Shared v2 external dependency drifted: ${dependency.destination}`);
      }
    } catch {
      errors.push(`Shared v2 external dependency is missing: ${dependency.destination}`);
    }
  }
  for (const output of activationOutputs) {
    if (!output || !safePath(output.destination) || destinations.has(output.destination)) {
      errors.push('Shared v2 activation output entry is invalid.');
      continue;
    }
    destinations.add(output.destination);
    sourceByDestination.set(output.destination, null);
  }
  const aggregate = sha256(
    JSON.stringify(canonicalManifestEntries(manifest.files, manifest.externalDependencies, activationOutputs)),
  );
  if (aggregate !== manifest.aggregateSha256) errors.push('Shared v2 aggregate manifest digest mismatch.');

  for (const entry of manifest.files.filter((item) => item.destination.endsWith('.ts'))) {
    const content = fs.readFileSync(path.join(sourceRoot, entry.sourcePath), 'utf8');
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
  for (const entry of manifest.files.filter((item) => item.destination.endsWith('.json'))) {
    const sourcePath = path.join(sourceRoot, entry.sourcePath);
    try {
      errors.push(
        ...collectJsonDependencyErrors(
          JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
          entry.destination,
          sourceByDestination,
          digestByDestination,
        ),
      );
    } catch {
      errors.push(`Shared v2 JSON source cannot be parsed: ${entry.sourcePath}`);
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
  const activeRegistry = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'), 'utf8'),
  );
  const unit = Array.isArray(activeRegistry.agents)
    ? activeRegistry.agents.find((agent) => agent?.name === 'unit-test-reviewer')
    : undefined;
  const activeV1 =
    activeSchema.version === '1.0.0' &&
    activePolicy.version === '1.0.0' &&
    activeEngine.version === '1.0.1' &&
    unit?.promptFile === '.github/adversarial-agents/unit-test-reviewer/prompt.md';
  const activeV2 =
    activeSchema.version === '2.0.0' &&
    activePolicy.version === '2.0.0' &&
    activeEngine.version === '2.0.0' &&
    unit?.promptFile === '.github/adversarial-agents/unit-test-reviewer/prompt-v2.md';
  if (!activeV1 && !activeV2) {
    errors.push('Active reviewer is neither the reviewed v1 baseline nor the staged v2 contract.');
  }

  return { valid: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSharedV2Boundary();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.valid ? 0 : 3;
}

export { checkSharedV2Boundary };
