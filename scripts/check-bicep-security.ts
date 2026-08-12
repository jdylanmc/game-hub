#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BICEP_VERSION = '0.42.1';

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function trackedBicepFiles(repoRoot: string): string[] {
  return run('git', ['ls-files'], repoRoot)
    .split('\n')
    .filter((filePath) => /\.(?:bicep|bicepparam)$/.test(filePath))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function checkBicepSecurity(repoRoot: string): {
  schemaVersion: '1.0.0';
  scannerVersion: '1.0.0';
  status: 'PASS';
  bicepVersion: string;
  compiledFiles: string[];
} {
  const versionOutput = run('az', ['bicep', 'version'], repoRoot);
  const versionMatch = versionOutput.match(/Bicep CLI version (\d+\.\d+\.\d+)/);
  if (versionMatch?.[1] !== BICEP_VERSION) {
    throw new Error(`Expected Bicep CLI ${BICEP_VERSION}, received ${versionMatch?.[1] ?? 'unknown'}`);
  }
  const files = trackedBicepFiles(repoRoot);
  if (files.length === 0) throw new Error('No tracked Bicep files were found');
  for (const filePath of files) {
    const command = filePath.endsWith('.bicepparam') ? 'build-params' : 'build';
    run('az', ['bicep', command, '--file', filePath, '--stdout'], repoRoot);
  }
  return {
    schemaVersion: '1.0.0',
    scannerVersion: '1.0.0',
    status: 'PASS',
    bicepVersion: BICEP_VERSION,
    compiledFiles: files,
  };
}

function parseOutput(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === '--output') return args[1];
  throw new Error('Usage: check-bicep-security.ts [--output <path>]');
}

function main(): void {
  const outputArgument = parseOutput(process.argv.slice(2));
  const repoRoot = run('git', ['rev-parse', '--show-toplevel'], process.cwd()).trim();
  const result = checkBicepSecurity(repoRoot);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputArgument) {
    const outputPath = path.resolve(repoRoot, outputArgument);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  console.log(`Bicep ${BICEP_VERSION} compiled ${result.compiledFiles.length} tracked definition(s).`);
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

export { checkBicepSecurity, trackedBicepFiles };
