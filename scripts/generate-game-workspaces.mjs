import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const defaultPaths = {
  gamesDirectory: path.join(rootDirectory, 'games'),
  importMapOutputPath: path.join(rootDirectory, 'src/generated/game-import-map.ts'),
  publicManifestOutputPath: path.join(rootDirectory, 'public/generated/games.manifest.json'),
};

const requiredManifestFields = [
  'id',
  'title',
  'tagline',
  'description',
  'accent',
  'secondaryAccent',
  'technology',
  'order',
  'controls',
  'instructions',
];

async function readJson(filePath, description) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${description} at "${filePath}": ${detail}`, { cause: error });
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function ensureObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
}

function ensureString(value, message) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

function ensureBoolean(value, message) {
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }
}

function ensureNumber(value, message) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

function ensureStringArray(value, message) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(message);
  }
}

export function validateManifest(manifest, workspaceDirectoryName) {
  ensureObject(manifest, `Game manifest for ${workspaceDirectoryName} must be a JSON object.`);

  for (const field of requiredManifestFields) {
    if (!(field in manifest)) {
      throw new Error(`Game manifest for ${workspaceDirectoryName} is missing required field "${field}".`);
    }
  }

  ensureString(manifest.id, `Game manifest for ${workspaceDirectoryName} must include a non-empty "id" string.`);
  ensureString(manifest.title, `Game manifest for ${workspaceDirectoryName} must include a non-empty "title" string.`);
  ensureString(
    manifest.tagline,
    `Game manifest for ${workspaceDirectoryName} must include a non-empty "tagline" string.`,
  );
  ensureString(
    manifest.description,
    `Game manifest for ${workspaceDirectoryName} must include a non-empty "description" string.`,
  );
  ensureString(
    manifest.accent,
    `Game manifest for ${workspaceDirectoryName} must include a non-empty "accent" string.`,
  );
  ensureString(
    manifest.secondaryAccent,
    `Game manifest for ${workspaceDirectoryName} must include a non-empty "secondaryAccent" string.`,
  );
  ensureString(
    manifest.technology,
    `Game manifest for ${workspaceDirectoryName} must include a non-empty "technology" string.`,
  );
  if (manifest.technology !== 'Three.js') {
    throw new Error(`Game manifest for ${workspaceDirectoryName} must use "Three.js" as its technology.`);
  }
  ensureNumber(manifest.order, `Game manifest for ${workspaceDirectoryName} must include a numeric "order" field.`);

  if ('featured' in manifest) {
    ensureBoolean(
      manifest.featured,
      `Game manifest for ${workspaceDirectoryName} must use a boolean "featured" field when present.`,
    );
  }

  if (!Array.isArray(manifest.controls)) {
    throw new Error(`Game manifest for ${workspaceDirectoryName} must include a "controls" array.`);
  }

  manifest.controls.forEach((control, index) => {
    ensureObject(control, `Game manifest for ${workspaceDirectoryName} controls[${index}] must be an object.`);
    ensureString(
      control.action,
      `Game manifest for ${workspaceDirectoryName} controls[${index}].action must be a non-empty string.`,
    );
    ensureStringArray(
      control.inputs,
      `Game manifest for ${workspaceDirectoryName} controls[${index}].inputs must be an array of non-empty strings.`,
    );
  });

  ensureStringArray(
    manifest.instructions,
    `Game manifest for ${workspaceDirectoryName} instructions must be an array of non-empty strings.`,
  );

  return manifest;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortGames(left, right) {
  return (
    Number(Boolean(right.manifest.featured)) - Number(Boolean(left.manifest.featured)) ||
    left.manifest.order - right.manifest.order ||
    compareStrings(left.manifest.title, right.manifest.title)
  );
}

function normalizeImportSpecifier(relativePath) {
  const normalized = relativePath
    .split(path.sep)
    .join('/')
    .replace(/\.[cm]?[jt]sx?$/, '');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

async function writeIfChanged(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const currentContent = (await pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : undefined;

  if (currentContent === content) {
    return;
  }

  await fs.writeFile(filePath, content, 'utf8');
}

export function renderPublicManifest(workspaces) {
  return `${JSON.stringify(
    {
      games: workspaces.map((workspace) => workspace.manifest),
    },
    null,
    2,
  )}\n`;
}

export function renderImportMap(workspaces, importMapOutputPath = defaultPaths.importMapOutputPath) {
  const registeredIds = workspaces.map((workspace) => workspace.manifest.id);
  const entries = workspaces
    .map((workspace) => {
      const importSpecifier = normalizeImportSpecifier(
        path.relative(path.dirname(importMapOutputPath), workspace.entryPath),
      );

      return `  '${workspace.manifest.id}': async () => {\n    const module = await import('${importSpecifier}');\n    return {\n      manifest: module.manifest,\n      createGame: module.createGame,\n    };\n  },`;
    })
    .join('\n');

  return `// This file is auto-generated by scripts/generate-game-workspaces.mjs.\n// Do not edit by hand.\n\nimport type { GameModule } from '@game-hub/game-contract';\nimport { createGameModuleLoader } from '../game-module-loader';\n\nexport const registeredGameIds = ${JSON.stringify(registeredIds)} as const;\n\nexport type RegisteredGameId = (typeof registeredGameIds)[number];\n\nconst gameImportMap = {\n${entries}\n} satisfies Record<RegisteredGameId, () => Promise<GameModule>>;\n\nconst gameModuleLoader = createGameModuleLoader(registeredGameIds, gameImportMap);\n\nexport const hasGameLoader = gameModuleLoader.hasGameLoader;\nexport const loadGameModule = gameModuleLoader.loadGameModule;\n`;
}

export async function loadGameWorkspaces({ gamesDirectory = defaultPaths.gamesDirectory } = {}) {
  if (!(await pathExists(gamesDirectory))) {
    throw new Error(`The games workspace directory does not exist at "${gamesDirectory}".`);
  }

  const directoryEntries = (await fs.readdir(gamesDirectory, { withFileTypes: true })).sort((left, right) =>
    compareStrings(left.name, right.name),
  );
  const workspaces = [];
  const seenIds = new Map();

  for (const directoryEntry of directoryEntries) {
    if (!directoryEntry.isDirectory()) {
      continue;
    }

    const workspaceRoot = path.join(gamesDirectory, directoryEntry.name);
    const packageJsonPath = path.join(workspaceRoot, 'package.json');

    if (!(await pathExists(packageJsonPath))) {
      continue;
    }

    const packageJson = await readJson(packageJsonPath, `package definition for workspace "${directoryEntry.name}"`);
    ensureObject(packageJson, `Package definition for ${directoryEntry.name} must be a JSON object.`);
    ensureObject(packageJson.gameHub, `Package ${directoryEntry.name} must define a "gameHub" object in package.json.`);
    ensureString(
      packageJson.gameHub.manifest,
      `Package ${directoryEntry.name} must define a non-empty gameHub.manifest path.`,
    );
    ensureString(
      packageJson.gameHub.entry,
      `Package ${directoryEntry.name} must define a non-empty gameHub.entry path.`,
    );

    const manifestPath = path.join(workspaceRoot, packageJson.gameHub.manifest);
    const entryPath = path.join(workspaceRoot, packageJson.gameHub.entry);

    if (!(await pathExists(manifestPath))) {
      throw new Error(
        `Game manifest for workspace "${directoryEntry.name}" was not found at "${path.relative(
          gamesDirectory,
          manifestPath,
        )}" (configured by gameHub.manifest).`,
      );
    }

    if (!(await pathExists(entryPath))) {
      throw new Error(
        `Game entry module for workspace "${directoryEntry.name}" was not found at "${path.relative(
          gamesDirectory,
          entryPath,
        )}" (configured by gameHub.entry).`,
      );
    }

    const manifest = validateManifest(
      await readJson(manifestPath, `game manifest for workspace "${directoryEntry.name}"`),
      directoryEntry.name,
    );
    const duplicateWorkspace = seenIds.get(manifest.id);

    if (duplicateWorkspace) {
      throw new Error(
        `Duplicate game id "${manifest.id}" is declared by workspaces "${duplicateWorkspace}" and "${directoryEntry.name}". Game ids must be unique.`,
      );
    }

    seenIds.set(manifest.id, directoryEntry.name);
    workspaces.push({
      entryPath,
      manifest,
      packageName: packageJson.name,
      workspaceRoot,
    });
  }

  if (workspaces.length === 0) {
    throw new Error('No game workspaces were discovered under games/*.');
  }

  return workspaces.sort(sortGames);
}

export async function generateGameWorkspaceArtifacts({
  gamesDirectory = defaultPaths.gamesDirectory,
  importMapOutputPath = defaultPaths.importMapOutputPath,
} = {}) {
  const workspaces = await loadGameWorkspaces({ gamesDirectory });

  return {
    importMapText: renderImportMap(workspaces, importMapOutputPath),
    publicManifestText: renderPublicManifest(workspaces),
    workspaces,
  };
}

export async function generateGameWorkspaces({
  gamesDirectory = defaultPaths.gamesDirectory,
  importMapOutputPath = defaultPaths.importMapOutputPath,
  publicManifestOutputPath = defaultPaths.publicManifestOutputPath,
} = {}) {
  const artifacts = await generateGameWorkspaceArtifacts({
    gamesDirectory,
    importMapOutputPath,
  });

  await Promise.all([
    writeIfChanged(publicManifestOutputPath, artifacts.publicManifestText),
    writeIfChanged(importMapOutputPath, artifacts.importMapText),
  ]);

  return artifacts;
}

const isDirectInvocation = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  generateGameWorkspaces().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
