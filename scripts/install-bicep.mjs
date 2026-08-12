import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(path.join(rootDirectory, 'infra', '.bicep-version'), 'utf8').trim();
const azureCli = process.platform === 'win32' ? 'az.cmd' : 'az';
const result = spawnSync(azureCli, ['bicep', 'install', '--version', version, '--only-show-errors'], {
  cwd: rootDirectory,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`Unable to install Bicep ${version}:\n${result.stderr}`);
}

console.log(`Bicep ${version} is installed through Azure CLI.`);
