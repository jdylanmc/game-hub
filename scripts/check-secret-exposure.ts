#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCANNER_VERSION = '1.0.0';
const MAX_FINDINGS = 100;
const RULES = [
  { id: 'private-key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'github-token', expression: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g },
  { id: 'github-fine-grained-token', expression: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { id: 'azure-storage-account-key', expression: /\bAccountKey=[A-Za-z0-9+/]{40,}={0,2}(?:;|$)/g },
  { id: 'openai-api-key', expression: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
] as const;

interface SecretFinding {
  ruleId: string;
  path: string;
  line: number;
  fingerprint: string;
}

interface SecretScanResult {
  schemaVersion: '1.0.0';
  scannerVersion: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  baseSha: string;
  headSha: string;
  scannedAddedLines: number;
  findingCount: number;
  findings: SecretFinding[];
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function git(repoRoot: string, args: string[]): string {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', repoRoot, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_EXTERNAL_DIFF: '',
      GIT_OPTIONAL_LOCKS: '0',
    },
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function assertCommit(repoRoot: string, value: string, label: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(`${label} must be a full lowercase commit SHA`);
  git(repoRoot, ['cat-file', '-e', `${value}^{commit}`]);
}

function binaryChanges(repoRoot: string, baseSha: string, headSha: string): string[] {
  return git(repoRoot, ['diff', '--numstat', '-z', baseSha, headSha])
    .split('\0')
    .filter(Boolean)
    .flatMap((record) => {
      const [added, deleted, ...pathParts] = record.split('\t');
      return added === '-' && deleted === '-' ? [pathParts.join('\t')] : [];
    })
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function scanSecretDiff(repoRoot: string, baseSha: string, headSha: string): SecretScanResult {
  assertCommit(repoRoot, baseSha, 'baseSha');
  assertCommit(repoRoot, headSha, 'headSha');
  const findings: SecretFinding[] = binaryChanges(repoRoot, baseSha, headSha).map((filePath) => ({
    ruleId: 'unscannable-binary-change',
    path: filePath,
    line: 0,
    fingerprint: sha256(`unscannable-binary-change\0${filePath}`),
  }));
  const patch = git(repoRoot, ['diff', '--no-ext-diff', '--no-textconv', '--unified=0', baseSha, headSha, '--']);
  let filePath = '';
  let newLine = 0;
  let scannedAddedLines = 0;

  for (const line of patch.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.*)$/);
    if (fileMatch) {
      filePath = fileMatch[1];
      continue;
    }
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLine = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.slice(1);
      scannedAddedLines += 1;
      for (const rule of RULES) {
        rule.expression.lastIndex = 0;
        for (const match of content.matchAll(rule.expression)) {
          findings.push({
            ruleId: rule.id,
            path: filePath,
            line: newLine,
            fingerprint: sha256(`${rule.id}\0${filePath}\0${newLine}\0${match[0]}`),
          });
          if (findings.length > MAX_FINDINGS) {
            return {
              schemaVersion: '1.0.0',
              scannerVersion: SCANNER_VERSION,
              status: 'ERROR',
              baseSha,
              headSha,
              scannedAddedLines,
              findingCount: findings.length,
              findings: findings.slice(0, MAX_FINDINGS),
            };
          }
        }
      }
      newLine += 1;
    } else if (line.startsWith(' ') && filePath) {
      newLine += 1;
    }
  }

  return {
    schemaVersion: '1.0.0',
    scannerVersion: SCANNER_VERSION,
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    baseSha,
    headSha,
    scannedAddedLines,
    findingCount: findings.length,
    findings,
  };
}

function parseArguments(args: string[]): { baseSha: string; headSha: string; outputPath?: string } {
  let baseSha = '';
  let headSha = '';
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--base') baseSha = args[++index] ?? '';
    else if (args[index] === '--head') headSha = args[++index] ?? '';
    else if (args[index] === '--output') outputPath = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!baseSha || !headSha) throw new Error('--base and --head are required');
  return { baseSha, headSha, outputPath };
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const result = scanSecretDiff(repoRoot, args.baseSha, args.headSha);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (args.outputPath) {
    const outputPath = path.resolve(repoRoot, args.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  console.log(
    result.status === 'PASS'
      ? `Secret detection passed across ${result.scannedAddedLines} added lines.`
      : `Secret detection ${result.status.toLowerCase()} with ${result.findingCount} redacted finding(s).`,
  );
  if (result.status !== 'PASS') process.exitCode = 2;
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

export { scanSecretDiff };
export type { SecretScanResult };
