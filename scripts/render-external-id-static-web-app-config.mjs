import { readFileSync, writeFileSync } from 'node:fs';
import {
  loadExternalIdLocalAccountConfiguration,
  renderStaticWebAppExternalIdAuthentication,
} from './external-id-local-account.mjs';

const pathArgumentIndex = process.argv.indexOf('--path');
const configurationPath = pathArgumentIndex >= 0 ? process.argv[pathArgumentIndex + 1] : undefined;
if (!configurationPath) {
  throw new Error('--path is required.');
}

const staticWebAppConfiguration = JSON.parse(readFileSync(configurationPath, 'utf8'));
const rendered = renderStaticWebAppExternalIdAuthentication(
  staticWebAppConfiguration,
  loadExternalIdLocalAccountConfiguration(),
  {
    certificateKeyVaultReference: requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_CERTIFICATE_KEY_VAULT_REFERENCE'),
    clientId: requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_CLIENT_ID'),
    tenantId: requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_TENANT_ID'),
    tenantSubdomain: requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_TENANT_SUBDOMAIN'),
  },
);

writeFileSync(configurationPath, `${JSON.stringify(rendered, null, 2)}\n`);
console.log('Rendered the keyless Microsoft Entra External ID Static Web Apps configuration.');

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
