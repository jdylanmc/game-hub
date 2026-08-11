import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(rootDirectory, 'dist');
const manifestPath = path.join(distDirectory, '.vite', 'manifest.json');
const budgetPath = path.join(rootDirectory, 'config', 'bundle-budgets.json');

const [manifest, budgets] = await Promise.all([
  readJson(manifestPath, 'Vite build manifest'),
  readJson(budgetPath, 'bundle budget configuration'),
]);

const requiredBudgets = [
  'maxTotalBytes',
  'maxJavaScriptBytes',
  'maxStylesheetBytes',
  'maxEntryChunkBytes',
  'maxAsyncChunkBytes',
];
for (const budgetName of requiredBudgets) {
  if (!Number.isSafeInteger(budgets[budgetName]) || budgets[budgetName] <= 0) {
    throw new Error(`${budgetName} must be a positive integer in config/bundle-budgets.json.`);
  }
}

const assetPaths = new Set();
const entryChunks = new Set();
const asyncChunks = new Set();

for (const chunk of Object.values(manifest)) {
  if (chunk.file?.endsWith('.js')) {
    assetPaths.add(chunk.file);
    (chunk.isEntry ? entryChunks : asyncChunks).add(chunk.file);
  }

  for (const stylesheet of chunk.css ?? []) {
    assetPaths.add(stylesheet);
  }
}

if (entryChunks.size === 0) {
  throw new Error('The Vite build manifest does not contain an entry chunk.');
}

const assets = await Promise.all(
  [...assetPaths].map(async (assetPath) => {
    const stats = await fs.stat(path.join(distDirectory, assetPath));
    return { path: assetPath, bytes: stats.size };
  }),
);

const javascriptAssets = assets.filter(({ path: assetPath }) => assetPath.endsWith('.js'));
const stylesheetAssets = assets.filter(({ path: assetPath }) => assetPath.endsWith('.css'));
const violations = [];

checkTotal('total bundle', assets, budgets.maxTotalBytes);
checkTotal('JavaScript bundle', javascriptAssets, budgets.maxJavaScriptBytes);
checkTotal('stylesheet bundle', stylesheetAssets, budgets.maxStylesheetBytes);
checkChunks('entry chunk', entryChunks, budgets.maxEntryChunkBytes);
checkChunks('async chunk', asyncChunks, budgets.maxAsyncChunkBytes);

if (violations.length > 0) {
  throw new Error(
    `Bundle budgets exceeded:\n${violations.join('\n')}\nUpdate config/bundle-budgets.json only with an explained, reviewed regression.`,
  );
}

console.log(
  `Bundle budgets passed for ${formatBytes(sumBytes(assets))} across ${assets.length} JavaScript and stylesheet assets.`,
);

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${path.relative(rootDirectory, filePath)}.`, {
      cause: error,
    });
  }
}

function checkTotal(label, matchingAssets, maximumBytes) {
  const actualBytes = sumBytes(matchingAssets);
  if (actualBytes > maximumBytes) {
    violations.push(`${label}: ${formatBytes(actualBytes)} > ${formatBytes(maximumBytes)}`);
  }
}

function checkChunks(label, chunkPaths, maximumBytes) {
  for (const chunkPath of chunkPaths) {
    const asset = assets.find(({ path: assetPath }) => assetPath === chunkPath);
    if (!asset) {
      violations.push(`${label} ${chunkPath}: missing build output`);
    } else if (asset.bytes > maximumBytes) {
      violations.push(`${label} ${chunkPath}: ${formatBytes(asset.bytes)} > ${formatBytes(maximumBytes)}`);
    }
  }
}

function sumBytes(matchingAssets) {
  return matchingAssets.reduce((total, asset) => total + asset.bytes, 0);
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString('en-US')} bytes`;
}
