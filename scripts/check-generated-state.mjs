import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const generatedPaths = ['public/generated/games.manifest.json', 'src/generated/game-import-map.ts'];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}.`);
  }

  return result.stdout;
}

function readGitStatus(paths = []) {
  return run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths]);
}

const statusBeforeGeneration = readGitStatus();

run(process.execPath, [path.join(scriptDirectory, 'generate-game-workspaces.mjs')]);

const statusAfterGeneration = readGitStatus();
const generatedStatus = readGitStatus(generatedPaths);

if (!statusBeforeGeneration.equals(statusAfterGeneration)) {
  process.stderr.write(
    'Game workspace generation changed the repository state. Run "yarn generate:games" and commit the generated outputs.\n',
  );
  process.exitCode = 1;
} else if (generatedStatus.length > 0) {
  process.stderr.write(
    'Committed game workspace outputs are dirty. Restore or commit the generated files before validation.\n',
  );
  process.exitCode = 1;
}
