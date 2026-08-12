#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CONTAINER_NAMES = new Set([
  'Dockerfile',
  'compose.yml',
  'compose.yaml',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

function isContainerDefinition(filePath: string): boolean {
  const name = path.posix.basename(filePath);
  return CONTAINER_NAMES.has(name) || name.startsWith('Dockerfile.') || name.endsWith('.Dockerfile');
}

function trackedFiles(repoRoot: string): string[] {
  const result = spawnSync('git', ['-C', repoRoot, 'ls-files'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  return result.stdout.split('\n').filter(Boolean);
}

function checkContainerSecuritySurface(repoRoot: string): {
  schemaVersion: '1.0.0';
  scannerVersion: '1.0.0';
  status: 'NOT_APPLICABLE' | 'UNSUPPORTED';
  surface: 'containers';
  files: string[];
  reason: string;
} {
  const files = trackedFiles(repoRoot)
    .filter(isContainerDefinition)
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  return files.length === 0
    ? {
        schemaVersion: '1.0.0',
        scannerVersion: '1.0.0',
        status: 'NOT_APPLICABLE',
        surface: 'containers',
        files,
        reason:
          'No tracked container build or compose definitions exist; introducing one blocks until a reviewed scanner is configured.',
      }
    : {
        schemaVersion: '1.0.0',
        scannerVersion: '1.0.0',
        status: 'UNSUPPORTED',
        surface: 'containers',
        files,
        reason: 'Container definitions are present, but no reviewed deterministic image scanner is configured.',
      };
}

function parseOutput(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === '--output') return args[1];
  throw new Error('Usage: check-container-security-surface.ts [--output <path>]');
}

function main(): void {
  const outputArgument = parseOutput(process.argv.slice(2));
  const rootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (rootResult.status !== 0) throw new Error(`git rev-parse failed: ${rootResult.stderr.trim()}`);
  const repoRoot = rootResult.stdout.trim();
  const result = checkContainerSecuritySurface(repoRoot);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputArgument) {
    const outputPath = path.resolve(repoRoot, outputArgument);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  console.log(result.reason);
  if (result.status === 'UNSUPPORTED') process.exitCode = 2;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { checkContainerSecuritySurface, isContainerDefinition };
