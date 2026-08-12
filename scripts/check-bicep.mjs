import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAuthenticationInfrastructure,
  validateAuthenticationInfrastructure,
} from './check-authentication-infrastructure.mjs';
import {
  loadPublicIngressInfrastructure,
  validatePublicIngressInfrastructure,
} from './check-public-ingress-infrastructure.mjs';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const infraDirectory = path.join(rootDirectory, 'infra');
const expectedVersion = readFileSync(path.join(infraDirectory, '.bicep-version'), 'utf8').trim().replace(/^v/, '');
const azureCli = process.platform === 'win32' ? 'az.cmd' : 'az';

const versionResult = runAzureBicep(['version']);
const installedVersion = versionResult.stdout.match(/Bicep CLI version ([^\s]+)/)?.[1];

if (installedVersion !== expectedVersion) {
  throw new Error(
    `Bicep CLI ${expectedVersion} is required; found ${installedVersion ?? 'an unknown version'}. ` +
      'Run yarn infra:install.',
  );
}

const infrastructureFiles = walk(infraDirectory);
const modules = infrastructureFiles.filter((filePath) => filePath.endsWith('.bicep'));
const parameters = infrastructureFiles.filter((filePath) => filePath.endsWith('.bicepparam'));

for (const modulePath of modules) {
  runAzureBicep(['lint', '--file', modulePath]);
}

runAzureBicep(['build', '--file', path.join(infraDirectory, 'main.bicep'), '--stdout']);

for (const parameterPath of parameters) {
  runAzureBicep(['build-params', '--file', parameterPath, '--stdout']);
}

const authenticationViolations = validateAuthenticationInfrastructure(loadAuthenticationInfrastructure(rootDirectory));
if (authenticationViolations.length > 0) {
  throw new Error(`Authentication infrastructure policy failed:\n- ${authenticationViolations.join('\n- ')}`);
}

const publicIngressViolations = validatePublicIngressInfrastructure(loadPublicIngressInfrastructure(rootDirectory));
if (publicIngressViolations.length > 0) {
  throw new Error(`Public ingress infrastructure policy failed:\n- ${publicIngressViolations.join('\n- ')}`);
}

console.log(
  `Bicep validation passed with CLI ${expectedVersion} for ${modules.length} modules and ` +
    `${parameters.length} environment parameter files.`,
);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(entryPath) : entryPath;
    })
    .sort();
}

function runAzureBicep(args) {
  const result = spawnSync(azureCli, ['bicep', ...args], {
    cwd: rootDirectory,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`az bicep ${args[0]} failed:\n${result.stderr}${result.stdout}`);
  }

  return result;
}
