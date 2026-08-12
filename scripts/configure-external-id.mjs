import { DefaultAzureCredential } from '@azure/identity';
import {
  buildExternalIdLocalAccountState,
  loadExternalIdLocalAccountConfiguration,
  MicrosoftGraphClient,
  reconcileExternalIdLocalAccount,
  validateExternalIdLocalAccountConfiguration,
} from './external-id-local-account.mjs';

const configuration = loadExternalIdLocalAccountConfiguration();
const violations = validateExternalIdLocalAccountConfiguration(configuration);
if (violations.length > 0) {
  throw new Error(`External ID local-account configuration failed:\n- ${violations.join('\n- ')}`);
}

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check') || !apply;
if (apply && check && process.argv.includes('--check')) {
  throw new Error('Choose either --check or --apply.');
}

if (!apply) {
  console.log('External ID local-account configuration passed.');
} else {
  const applicationId = requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_APP_ID');
  const environment = requiredEnvironmentVariable('GAME_HUB_ENVIRONMENT');
  const tenantId = requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_TENANT_ID');
  const desiredState = buildExternalIdLocalAccountState(configuration, {
    applicationId,
    environment,
  });
  const credential = new DefaultAzureCredential({ tenantId });
  const graph = new MicrosoftGraphClient(async () => {
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    if (!token?.token) {
      throw new Error('Keyless Microsoft Graph authentication did not return an access token.');
    }
    return token.token;
  });
  const result = await reconcileExternalIdLocalAccount(graph, desiredState);
  console.log(JSON.stringify(result, null, 2));
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
