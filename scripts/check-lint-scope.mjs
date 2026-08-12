import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceProbeSource = 'const lintCoverageProbe = 1;\n';
const fixProbeSource =
  "const lintFixBoundaryProbe = 'unchanged';\nimport path from 'node:path';\nvoid lintFixBoundaryProbe;\nvoid path;\n";
const cleanupTasks = [];
let runError;

try {
  const workspaceProbePaths = await Promise.all([
    createWorkspaceProbe('games/lint-scope-game', '@game-hub/lint-scope-game'),
    createWorkspaceProbe('packages/lint-scope-package', '@game-hub/lint-scope-package'),
  ]);
  const eslint = new ESLint({ errorOnUnmatchedPattern: false });
  const workspaceResults = await eslint.lintFiles(workspaceProbePaths);

  for (const workspaceProbePath of workspaceProbePaths) {
    const absoluteProbePath = path.join(rootDirectory, workspaceProbePath);
    const result = workspaceResults.find(({ filePath }) => filePath === absoluteProbePath);

    if (!result) {
      throw new Error(`${workspaceProbePath} bypassed the repository lint configuration.`);
    }
    if (result.messages.some(({ fatal }) => fatal)) {
      throw new Error(`${workspaceProbePath} failed lint setup:\n${formatMessages(result.messages)}`);
    }
    if (!result.messages.some(({ ruleId }) => ruleId === '@typescript-eslint/no-unused-vars')) {
      throw new Error(
        `${workspaceProbePath} did not report the representative @typescript-eslint/no-unused-vars violation.`,
      );
    }
  }

  const authoredPaths = [
    '.storybook/main.ts',
    '.storybook/preview.ts',
    'eslint.config.js',
    'games/floppy-bird/src/index.test.ts',
    'games/floppy-bird/src/index.ts',
    'packages/game-contract/src/index.test.ts',
    'packages/game-contract/src/index.ts',
    'scripts/generate-game-workspaces.mjs',
    'scripts/generate-mamba-storybook.mjs',
    'src/App.tsx',
    'src/stories/catalog/MambaHighlights.stories.tsx',
    'src/stories/catalog/MambaOverview.stories.tsx',
    'src/storybook/mamba/MambaSnapshot.tsx',
    'src/storybook/mamba/types.ts',
    'src/test/setup.ts',
  ];

  for (const authoredPath of authoredPaths) {
    if (await eslint.isPathIgnored(authoredPath)) {
      throw new Error(`Authored lint target is unexpectedly ignored: ${authoredPath}`);
    }
  }

  const ignoredPaths = [
    '.yarn/lint-scope-probe/index.mjs',
    'coverage/lint-scope-probe/index.mjs',
    'dist/lint-scope-probe/index.mjs',
    'games/lint-scope-output/dist/index.mjs',
    'node_modules/lint-scope-probe/index.mjs',
    'packages/lint-scope-output/coverage/index.mjs',
    'public/generated/lint-scope-probe/index.mjs',
    'src/generated/lint-scope-probe/index.mjs',
    'src/stories/catalog/mamba/lint-scope-probe/index.mjs',
    'src/storybook/mamba/generated/lint-scope-probe/index.mjs',
    'src/storybook/mamba/source/lint-scope-probe/index.mjs',
    'storybook-static/lint-scope-probe/index.mjs',
    'test-results/lint-scope-probe/index.mjs',
  ];

  for (const ignoredPath of ignoredPaths) {
    if (!(await eslint.isPathIgnored(ignoredPath))) {
      throw new Error(`Generated, imported, dependency, or output path is unexpectedly linted: ${ignoredPath}`);
    }
  }

  const fixProbePaths = await Promise.all(
    ignoredPaths
      .filter((ignoredPath) => !ignoredPath.startsWith('.yarn/') && !ignoredPath.startsWith('node_modules/'))
      .map((ignoredPath) => createScratchFile(path.dirname(ignoredPath), path.basename(ignoredPath), fixProbeSource)),
  );
  const fixingEslint = new ESLint({
    errorOnUnmatchedPattern: false,
    fix: true,
    warnIgnored: false,
  });
  const fixResults = await fixingEslint.lintFiles(fixProbePaths);
  await ESLint.outputFixes(fixResults);

  if (fixResults.length > 0) {
    throw new Error('lint:fix unexpectedly returned results for an excluded probe.');
  }

  for (const fixProbePath of fixProbePaths) {
    const content = await fs.readFile(path.join(rootDirectory, fixProbePath), 'utf8');
    if (content !== fixProbeSource) {
      throw new Error(`lint:fix unexpectedly modified excluded content: ${fixProbePath}`);
    }
  }

  console.log('Lint scope policy passed for future workspaces, authored wrappers, and excluded outputs.');
} catch (error) {
  runError = error;
} finally {
  for (const cleanup of cleanupTasks.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      runError ??= error;
    }
  }
}

if (runError) {
  throw runError;
}

async function createWorkspaceProbe(relativeRoot, packageName) {
  const sourcePath = path.join('src', 'index.ts');
  await createScratchDirectory(relativeRoot, {
    'AGENTS.md': '# Lint Scope Probe\n',
    'package.json': `${JSON.stringify({ name: packageName, private: true, version: '0.0.0' }, null, 2)}\n`,
    [sourcePath]: workspaceProbeSource,
  });
  return path.join(relativeRoot, sourcePath);
}

async function createScratchFile(relativeRoot, fileName, content) {
  await createScratchDirectory(relativeRoot, { [fileName]: content });
  return path.join(relativeRoot, fileName);
}

async function createScratchDirectory(relativeRoot, files) {
  const absoluteRoot = path.join(rootDirectory, relativeRoot);
  const parentDirectory = path.dirname(absoluteRoot);
  const parentExisted = await pathExists(parentDirectory);

  if (await pathExists(absoluteRoot)) {
    throw new Error(`Refusing to replace existing lint scope probe path: ${relativeRoot}`);
  }

  await fs.mkdir(absoluteRoot, { recursive: true });
  cleanupTasks.push(async () => {
    await fs.rm(absoluteRoot, { force: true, recursive: true });
    if (!parentExisted && (await fs.readdir(parentDirectory)).length === 0) {
      await fs.rmdir(parentDirectory);
    }
  });

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const filePath = path.join(absoluteRoot, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
    }),
  );
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function formatMessages(messages) {
  return messages
    .map(({ line, column, message, ruleId }) => `${line}:${column} ${ruleId ?? 'fatal'} ${message}`)
    .join('\n');
}
