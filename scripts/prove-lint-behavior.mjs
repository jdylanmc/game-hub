import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yarnExecutable = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const snapshotExtensionPattern = /\.(?:[cm]?[jt]sx?|json|md)$/;
const requiredUnchangedPaths = [
  'README.md',
  'public/generated/games.manifest.json',
  'scripts/generate-game-workspaces.mjs',
  'src/App.tsx',
  'src/generated/game-import-map.ts',
  'src/stories/catalog/mamba/Article.stories.tsx',
  'src/storybook/mamba/generated/article.generated.ts',
  'src/storybook/mamba/source/article/article1.component.ts',
];

const ruleProbes = [
  {
    expectedRules: ['@typescript-eslint/no-unused-vars'],
    files: {
      'src/lint-proof-unused.ts': 'const lintProofUnused = 1;\nexport {};\n',
    },
    label: 'TypeScript unused code',
    targetPath: 'src/lint-proof-unused.ts',
  },
  {
    expectedRules: [
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-unsafe-assignment',
      '@typescript-eslint/no-unsafe-member-access',
    ],
    files: {
      'src/lint-proof-unsafe.ts':
        'const lintProofUnsafe: any = {};\nexport const lintProofValue: string = lintProofUnsafe.value;\n',
    },
    label: 'unsafe TypeScript',
    targetPath: 'src/lint-proof-unsafe.ts',
  },
  {
    expectedRules: ['@typescript-eslint/no-floating-promises', '@typescript-eslint/no-misused-promises'],
    files: {
      'src/lint-proof-promises.ts': [
        'function lintProofLoad(): Promise<void> {',
        '  return Promise.resolve();',
        '}',
        'lintProofLoad();',
        '[1].forEach(async () => {',
        '  await lintProofLoad();',
        '});',
        '',
      ].join('\n'),
    },
    label: 'promise handling',
    targetPath: 'src/lint-proof-promises.ts',
  },
  {
    expectedRules: ['react/jsx-no-undef'],
    files: {
      'src/lint-proof-react.tsx': 'export function LintProofReact() {\n  return <LintProofMissingComponent />;\n}\n',
    },
    label: 'React correctness',
    targetPath: 'src/lint-proof-react.tsx',
  },
  {
    expectedRules: ['react-hooks/rules-of-hooks'],
    files: {
      'src/lint-proof-hooks.tsx': [
        "import { useState } from 'react';",
        '',
        'export function lintProofHookHelper() {',
        '  const [value] = useState(0);',
        '  return value;',
        '}',
        '',
      ].join('\n'),
    },
    label: 'React Hooks correctness',
    targetPath: 'src/lint-proof-hooks.tsx',
  },
  {
    expectedRules: ['jsx-a11y/alt-text'],
    files: {
      'src/lint-proof-accessibility.tsx':
        'export function LintProofImage() {\n  return <img src="/lint-proof.png" />;\n}\n',
    },
    label: 'accessibility',
    targetPath: 'src/lint-proof-accessibility.tsx',
  },
  {
    expectedRules: ['import-x/default', 'import-x/first', 'import-x/no-duplicates', 'import-x/no-unresolved'],
    files: {
      'src/lint-proof-import-source.ts': 'export const lintProofImportValue = 1;\n',
      'src/lint-proof-imports.ts': [
        'const lintProofBeforeImports = true;',
        "import lintProofInvalidDefault from './lint-proof-import-source';",
        "import { useEffect } from 'react';",
        "import { useState } from 'react';",
        "import lintProofUnresolved from './lint-proof-missing';",
        'void lintProofBeforeImports;',
        'void lintProofInvalidDefault;',
        'void useEffect;',
        'void useState;',
        'void lintProofUnresolved;',
        '',
      ].join('\n'),
    },
    label: 'import correctness',
    targetPath: 'src/lint-proof-imports.ts',
  },
  {
    expectedRules: ['no-undef'],
    files: {
      'scripts/lint-proof-environment.mjs': "document.title = 'lint environment proof';\n",
    },
    label: 'Node.js environment isolation',
    targetPath: 'scripts/lint-proof-environment.mjs',
  },
];

async function proveLintBehavior() {
  runRequired('baseline canonical lint', yarnExecutable, ['lint']);

  for (const probe of ruleProbes) {
    await withScratchFiles(probe.files, async () => {
      const result = runRaw(yarnExecutable, ['eslint', probe.targetPath, '--max-warnings', '0', '--format', 'json']);
      const results = parseEslintJsonOutput(result.stdout);
      const violations = validateRuleFailureEvidence({
        expectedFilePath: path.join(rootDirectory, probe.targetPath),
        expectedRules: probe.expectedRules,
        results,
        status: result.status,
      });

      if (result.error) throw result.error;
      if (violations.length > 0) {
        throw new Error(
          `${probe.label} proof failed:\n${violations.join('\n')}\n${result.stdout}${result.stderr}`.trim(),
        );
      }
      console.log(`Verified ${probe.label} fails for ${probe.expectedRules.join(', ')}.`);
    });
  }

  await proveWarningsFailCanonicalLint();
  await proveCanonicalFixSafety();
  console.log('Lint behavior proof passed for representative failures, warnings, and safe fixes.');
}

async function proveWarningsFailCanonicalLint() {
  const probePath = 'scripts/lint-proof-warning.mjs';
  await withScratchFiles(
    {
      [probePath]: '/* eslint no-console: "warn" */\nconsole.log("lint warning proof");\n',
    },
    () => {
      const result = runRaw(yarnExecutable, ['lint', '--format', 'json']);
      const results = parseEslintJsonOutput(result.stdout);
      const violations = validateWarningFailureEvidence({
        expectedFilePath: path.join(rootDirectory, probePath),
        results,
        status: result.status,
        stderr: result.stderr,
      });

      if (result.error) throw result.error;
      if (violations.length > 0) {
        throw new Error(
          `Zero-warning proof failed:\n${violations.join('\n')}\n${result.stdout}${result.stderr}`.trim(),
        );
      }
      console.log('Verified the canonical lint command rejects one warning with zero errors.');
    },
  );
}

async function proveCanonicalFixSafety() {
  const fixProbePath = 'scripts/lint-proof-fix.mjs';
  const unrelatedProbePath = 'scripts/lint-proof-unrelated.mjs';
  const originalFixSource = [
    "const lintFixProof = 'fixed';",
    "import path from 'node:path';",
    'void lintFixProof;',
    'void path;',
    '',
  ].join('\n');
  const fixedSource = [
    "import path from 'node:path';",
    "const lintFixProof = 'fixed';",
    'void lintFixProof;',
    'void path;',
    '',
  ].join('\n');

  await withScratchFiles(
    {
      [fixProbePath]: originalFixSource,
      [unrelatedProbePath]: "export const lintProofUnrelated = 'unchanged';\n",
    },
    async () => {
      const snapshot = await snapshotRepositoryFiles();
      for (const requiredPath of [...requiredUnchangedPaths, unrelatedProbePath]) {
        if (!snapshot.has(requiredPath)) {
          throw new Error(`Fix safety snapshot is missing required unchanged path: ${requiredPath}`);
        }
      }

      runRequired('canonical lint fix', yarnExecutable, ['lint:fix']);

      const fixedContent = await fs.readFile(path.join(rootDirectory, fixProbePath), 'utf8');
      if (fixedContent !== fixedSource) {
        throw new Error(`lint:fix did not apply the expected supported import-order fix:\n${fixedContent}`);
      }

      for (const [relativePath, before] of snapshot) {
        if (relativePath === fixProbePath) continue;
        const after = await fs.readFile(path.join(rootDirectory, relativePath));
        if (!before.equals(after)) {
          throw new Error(`lint:fix unexpectedly modified generated, imported, or unrelated content: ${relativePath}`);
        }
      }

      runRequired('post-fix canonical lint', yarnExecutable, ['lint']);
      console.log(
        `Verified lint:fix applied one supported fix while ${snapshot.size - 1} generated, imported, and unrelated files stayed byte-identical.`,
      );
    },
  );
}

function validateRuleFailureEvidence({ expectedFilePath, expectedRules, results, status }) {
  const violations = [];
  if (status !== 1) {
    violations.push(`Expected ESLint rule failure status 1, received ${String(status)}.`);
  }
  if (!Array.isArray(results) || results.length !== 1) {
    violations.push('Expected exactly one structured ESLint result for the isolated probe.');
    return violations;
  }

  const [result] = results;
  if (result.filePath !== expectedFilePath) {
    violations.push(`Expected result for ${expectedFilePath}, received ${String(result.filePath)}.`);
  }
  if (!Array.isArray(result.messages) || result.messages.length === 0) {
    violations.push('Expected at least one actionable ESLint diagnostic.');
    return violations;
  }
  if (result.messages.some(({ fatal }) => fatal)) {
    violations.push('Fatal parser or setup diagnostics cannot satisfy a rule proof.');
  }
  if (result.messages.some(({ line, column }) => !Number.isInteger(line) || !Number.isInteger(column))) {
    violations.push('Every representative diagnostic must include a file line and column.');
  }
  if (result.messages.some(({ severity }) => severity !== 2)) {
    violations.push('Representative rule failures must be errors, not warnings.');
  }
  if (result.warningCount !== 0 || result.errorCount !== result.messages.length) {
    violations.push('Structured ESLint counts do not describe only the expected rule errors.');
  }

  const actualRules = new Set(result.messages.map(({ ruleId }) => ruleId));
  const expectedRuleSet = new Set(expectedRules);
  for (const rule of expectedRuleSet) {
    if (!actualRules.has(rule)) {
      violations.push(`Missing expected rule diagnostic: ${rule}.`);
    }
  }
  for (const rule of actualRules) {
    if (!expectedRuleSet.has(rule)) {
      violations.push(`Unexpected rule or setup diagnostic: ${String(rule)}.`);
    }
  }

  return violations;
}

function validateWarningFailureEvidence({ expectedFilePath, results, status, stderr }) {
  const violations = [];
  if (status !== 1) {
    violations.push(`Expected zero-warning policy status 1, received ${String(status)}.`);
  }
  if (!/ESLint found too many warnings/.test(stderr)) {
    violations.push('Canonical lint output did not attribute failure to --max-warnings 0.');
  }
  if (!Array.isArray(results)) {
    violations.push('Canonical lint did not emit structured ESLint results.');
    return violations;
  }

  const diagnostics = results.flatMap((result) =>
    (result.messages ?? []).map((message) => ({ ...message, filePath: result.filePath })),
  );
  if (diagnostics.length !== 1) {
    violations.push(`Expected exactly one warning diagnostic, received ${diagnostics.length}.`);
    return violations;
  }

  const [diagnostic] = diagnostics;
  if (
    diagnostic.filePath !== expectedFilePath ||
    diagnostic.ruleId !== 'no-console' ||
    diagnostic.severity !== 1 ||
    diagnostic.fatal
  ) {
    violations.push('The canonical warning failure was not the isolated no-console warning.');
  }
  if (!Number.isInteger(diagnostic.line) || !Number.isInteger(diagnostic.column)) {
    violations.push('The representative warning must include a file line and column.');
  }
  if (results.some(({ errorCount = 0 }) => errorCount !== 0)) {
    violations.push('Unrelated ESLint errors cannot satisfy the zero-warning proof.');
  }
  if (results.reduce((count, result) => count + (result.warningCount ?? 0), 0) !== 1) {
    violations.push('Canonical lint did not report exactly one warning.');
  }

  return violations;
}

function parseEslintJsonOutput(output) {
  const start = output.indexOf('[{');
  const end = output.lastIndexOf(']');
  if (start === -1 || end < start) {
    throw new Error(`ESLint did not emit a structured JSON result:\n${output.slice(-4000)}`);
  }

  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Unable to parse ESLint JSON evidence: ${error.message}`);
  }
}

async function snapshotRepositoryFiles() {
  const result = runRequired('list repository files for fix safety', 'git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  const relativePaths = result.stdout
    .split('\0')
    .filter((relativePath) => relativePath && snapshotExtensionPattern.test(relativePath));
  return new Map(
    await Promise.all(
      relativePaths.map(async (relativePath) => [
        relativePath,
        await fs.readFile(path.join(rootDirectory, relativePath)),
      ]),
    ),
  );
}

async function withScratchFiles(files, callback) {
  const relativePaths = Object.keys(files);
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDirectory, relativePath);
    try {
      await fs.access(absolutePath);
      throw new Error(`Refusing to replace existing lint behavior probe: ${relativePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  try {
    await Promise.all(
      Object.entries(files).map(async ([relativePath, content]) => {
        const absolutePath = path.join(rootDirectory, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, content);
      }),
    );
    return await callback();
  } finally {
    await Promise.all(
      relativePaths.map((relativePath) => fs.rm(path.join(rootDirectory, relativePath), { force: true })),
    );
  }
}

function runRequired(label, command, args) {
  const result = runRaw(command, args);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with status ${String(result.status)}:\n${result.stdout}${result.stderr}`.slice(-12000),
    );
  }
  return result;
}

function runRaw(command, args) {
  return spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await proveLintBehavior();
}

export { parseEslintJsonOutput, validateRuleFailureEvidence, validateWarningFailureEvidence };
