// @vitest-environment node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateGameWorkspaceArtifacts, loadGameWorkspaces, validateManifest } from './generate-game-workspaces.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const fixtureRoot = path.join(scriptDirectory, 'fixtures/game-workspaces');
const committedOutputPaths = [
  path.join(repositoryRoot, 'public/generated/games.manifest.json'),
  path.join(repositoryRoot, 'src/generated/game-import-map.ts'),
];

function pathsForFixture(name) {
  const root = path.join(fixtureRoot, name);

  return {
    gamesDirectory: path.join(root, 'games'),
    importMapOutputPath: path.join(root, 'src/generated/game-import-map.ts'),
    root,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

describe('game workspace generation', () => {
  it('validates required manifest fields and nested values with actionable errors', async () => {
    const validManifest = await readJson(path.join(fixtureRoot, 'valid/games/b-alpha/game.manifest.json'));
    const missingTitle = { ...validManifest };
    delete missingTitle.title;

    expect(() => validateManifest(missingTitle, 'fixture-game')).toThrow(
      'Game manifest for fixture-game is missing required field "title".',
    );
    expect(() => validateManifest({ ...validManifest, technology: 'Canvas' }, 'fixture-game')).toThrow(
      'Game manifest for fixture-game must use "Three.js" as its technology.',
    );
    expect(() =>
      validateManifest(
        {
          ...validManifest,
          controls: [{ action: 'Start', inputs: [''] }],
        },
        'fixture-game',
      ),
    ).toThrow('Game manifest for fixture-game controls[0].inputs must be an array of non-empty strings.');
    expect(() => validateManifest({ ...validManifest, featured: 'yes' }, 'fixture-game')).toThrow(
      'Game manifest for fixture-game must use a boolean "featured" field when present.',
    );
  });

  it('discovers game packages, ignores non-packages, and sorts featured, order, then title', async () => {
    const workspaces = await loadGameWorkspaces(pathsForFixture('valid'));

    expect(workspaces.map((workspace) => workspace.manifest.id)).toEqual(['featured', 'alpha', 'beta']);
    expect(workspaces.map((workspace) => path.basename(workspace.workspaceRoot))).toEqual([
      'z-featured',
      'b-alpha',
      'c-beta',
    ]);
  });

  it('renders stable manifest and import-map text without writing fixture or committed outputs', async () => {
    const fixturePaths = pathsForFixture('valid');
    const committedBefore = await Promise.all(committedOutputPaths.map((filePath) => fs.readFile(filePath, 'utf8')));

    const artifacts = await generateGameWorkspaceArtifacts(fixturePaths);

    await expect(
      fs.readFile(path.join(fixturePaths.root, 'src/generated/game-import-map.ts'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(artifacts.publicManifestText).toBe(
      await fs.readFile(path.join(fixturePaths.root, 'expected/games-manifest.txt'), 'utf8'),
    );
    expect(artifacts.importMapText).toBe(
      await fs.readFile(path.join(fixturePaths.root, 'expected/game-import-map.txt'), 'utf8'),
    );
    await expect(Promise.all(committedOutputPaths.map((filePath) => fs.readFile(filePath, 'utf8')))).resolves.toEqual(
      committedBefore,
    );
  });

  it('rejects duplicate identifiers with both owning workspace names', async () => {
    await expect(loadGameWorkspaces(pathsForFixture('duplicate-ids'))).rejects.toThrow(
      'Duplicate game id "duplicate" is declared by workspaces "first" and "second". Game ids must be unique.',
    );
  });

  it('rejects malformed manifests with the workspace and missing field', async () => {
    await expect(loadGameWorkspaces(pathsForFixture('invalid-manifest'))).rejects.toThrow(
      'Game manifest for broken is missing required field "title".',
    );
  });

  it.each([
    ['missing-package-entry', 'Package broken must define a non-empty gameHub.entry path.'],
    [
      'missing-entry-file',
      'Game entry module for workspace "broken" was not found at "broken/src/missing.mjs" (configured by gameHub.entry).',
    ],
    [
      'missing-manifest-file',
      'Game manifest for workspace "broken" was not found at "broken/missing.manifest.json" (configured by gameHub.manifest).',
    ],
  ])('rejects incomplete workspace fixture %s', async (fixtureName, message) => {
    await expect(loadGameWorkspaces(pathsForFixture(fixtureName))).rejects.toThrow(message);
  });
});
