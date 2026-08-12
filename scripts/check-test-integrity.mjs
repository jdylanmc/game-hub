import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { testRootsFromManifest } from './test-discovery.mjs';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageManifest = JSON.parse(await fs.readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const requiredTestRoots = testRootsFromManifest(packageManifest);
const testFilePattern = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const prohibitedPatterns = [
  { label: 'focused test', pattern: /\b(?:describe|it|test)\.only\s*\(/ },
  { label: 'skipped test', pattern: /\b(?:describe|it|test)\.skip\s*\(/ },
  { label: 'todo test', pattern: /\b(?:describe|it|test)\.todo\s*\(/ },
  { label: 'quarantined test', pattern: /\bquarantin(?:e|ed)\b/i },
];

async function collectTestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(entryPath)));
    } else if (testFilePattern.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

const testFilesByRoot = await Promise.all(
  requiredTestRoots.map(async (root) => {
    const directory = path.join(rootDirectory, root);
    const testFiles = await collectTestFiles(directory);
    return { root, testFiles };
  }),
);

const missingRoots = testFilesByRoot.filter(({ testFiles }) => testFiles.length === 0).map(({ root }) => root);

if (missingRoots.length > 0) {
  throw new Error(`Expected at least one test file under: ${missingRoots.join(', ')}.`);
}

const violations = [];

for (const { testFiles } of testFilesByRoot) {
  for (const testFile of testFiles) {
    const content = await fs.readFile(testFile, 'utf8');

    for (const { label, pattern } of prohibitedPatterns) {
      if (pattern.test(content)) {
        violations.push(`${path.relative(rootDirectory, testFile)} contains a ${label}.`);
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(violations.join('\n'));
}

const testCount = testFilesByRoot.reduce((count, { testFiles }) => count + testFiles.length, 0);
console.log(`Test integrity passed for ${testCount} files across ${requiredTestRoots.join(', ')}.`);
