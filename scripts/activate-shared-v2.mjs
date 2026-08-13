#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = 'docs/memories/56-shared-adversarial-reviewer-platform/shared-v2-manifest.json';

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

function readRegularFile(filePath, description) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${description} must be a regular file: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function validateManifest(repoRoot, manifestDirectory, manifest) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.externalDependencies)
  ) {
    throw new Error('Shared v2 activation manifest is malformed.');
  }
  const destinations = new Set();
  const staged = manifest.files.map((entry) => {
    if (
      !entry ||
      !safePath(entry.sourcePath) ||
      !safePath(entry.destination) ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      destinations.has(entry.destination)
    ) {
      throw new Error('Shared v2 activation manifest entry is invalid.');
    }
    destinations.add(entry.destination);
    const source = readRegularFile(path.join(manifestDirectory, entry.sourcePath), 'Shared v2 activation source');
    if (sha256(source) !== entry.sha256) {
      throw new Error(`Shared v2 activation source digest mismatch: ${entry.sourcePath}`);
    }
    return { destination: entry.destination, content: source };
  });

  for (const dependency of manifest.externalDependencies) {
    if (
      !dependency ||
      !safePath(dependency.destination) ||
      typeof dependency.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(dependency.sha256) ||
      destinations.has(dependency.destination)
    ) {
      throw new Error('Shared v2 activation external dependency is invalid.');
    }
    const content = readRegularFile(path.join(repoRoot, dependency.destination), 'Shared v2 external dependency');
    if (sha256(content) !== dependency.sha256) {
      throw new Error(`Shared v2 activation external dependency drifted: ${dependency.destination}`);
    }
  }

  const registry = staged.find((entry) => entry.destination === 'config/adversarial-agents/agents-config.json');
  if (registry) {
    const value = JSON.parse(registry.content.toString('utf8'));
    if (
      Array.isArray(value.agents) &&
      value.agents.some((agent) => agent?.name === 'gilfoyle-security-architect' && agent.enabled)
    ) {
      throw new Error('Shared v2 activation must not enable Gilfoyle.');
    }
  }

  return staged.sort((left, right) => Buffer.from(left.destination).compare(Buffer.from(right.destination)));
}

function activateSharedV2({ repoRoot = defaultRoot, manifestPath = path.join(defaultRoot, defaultManifest) } = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedManifest = path.resolve(repoRoot, manifestPath);
  const manifest = JSON.parse(readRegularFile(resolvedManifest, 'Shared v2 activation manifest').toString('utf8'));
  const staged = validateManifest(resolvedRoot, path.dirname(resolvedManifest), manifest);
  const changes = staged.filter((entry) => {
    const destination = path.join(resolvedRoot, entry.destination);
    return (
      !fs.existsSync(destination) ||
      !readRegularFile(destination, 'Shared v2 activation destination').equals(entry.content)
    );
  });
  const unchanged = staged.filter((entry) => !changes.includes(entry)).map((entry) => entry.destination);
  if (changes.length === 0) return { written: [], unchanged };

  const transactionDirectory = path.join(resolvedRoot, '.shared-v2-activation-transaction');
  if (fs.existsSync(transactionDirectory)) {
    throw new Error('Shared v2 activation transaction directory already exists.');
  }

  const originals = new Map();
  try {
    for (const change of changes) {
      const destination = path.join(resolvedRoot, change.destination);
      originals.set(
        change.destination,
        fs.existsSync(destination) ? readRegularFile(destination, 'Shared v2 activation destination') : null,
      );
      const stagedDestination = path.join(transactionDirectory, change.destination);
      fs.mkdirSync(path.dirname(stagedDestination), { recursive: true });
      fs.writeFileSync(stagedDestination, change.content, { flag: 'wx' });
    }
    for (const change of changes) {
      const destination = path.join(resolvedRoot, change.destination);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(path.join(transactionDirectory, change.destination), destination);
    }
  } catch (error) {
    for (const [destination, original] of originals) {
      const destinationPath = path.join(resolvedRoot, destination);
      if (original === null) {
        fs.rmSync(destinationPath, { force: true });
      } else {
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.writeFileSync(destinationPath, original);
      }
    }
    throw error;
  } finally {
    fs.rmSync(transactionDirectory, { recursive: true, force: true });
  }
  return { written: changes.map((entry) => entry.destination), unchanged };
}

function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--apply')) {
    throw new Error('Shared v2 activation requires --apply.');
  }
  const valueFor = (flag) => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const result = activateSharedV2({
    repoRoot: valueFor('--repo-root') ?? defaultRoot,
    manifestPath: valueFor('--manifest') ?? path.join(defaultRoot, defaultManifest),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export { activateSharedV2 };
