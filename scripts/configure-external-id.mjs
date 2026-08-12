import { DefaultAzureCredential } from '@azure/identity';
import {
  buildExternalIdLocalAccountState,
  loadExternalIdLocalAccountConfiguration,
  MicrosoftGraphClient,
  reconcileExternalIdLocalAccount,
  validateExternalIdLocalAccountConfiguration,
} from './external-id-local-account.mjs';
import {
  buildExternalIdSocialProviderState,
  loadExternalIdSocialProviderConfiguration,
  reconcileExternalIdSocialProviders,
  validateExternalIdSocialProviderConfiguration,
} from './external-id-social-providers.mjs';

const localAccountConfiguration = loadExternalIdLocalAccountConfiguration();
const socialProviderConfiguration = loadExternalIdSocialProviderConfiguration();
const violations = [
  ...validateExternalIdLocalAccountConfiguration(localAccountConfiguration),
  ...validateExternalIdSocialProviderConfiguration(socialProviderConfiguration),
];
if (violations.length > 0) {
  throw new Error(`External ID configuration failed:\n- ${violations.join('\n- ')}`);
}

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check') || !apply;
if (apply && check && process.argv.includes('--check')) {
  throw new Error('Choose either --check or --apply.');
}

if (!apply) {
  console.log('External ID local-account and social-provider configuration passed.');
} else {
  const applicationId = requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_APP_ID');
  const environment = requiredEnvironmentVariable('GAME_HUB_ENVIRONMENT');
  const tenantId = requiredEnvironmentVariable('GAME_HUB_EXTERNAL_ID_TENANT_ID');
  const localAccountState = buildExternalIdLocalAccountState(localAccountConfiguration, {
    applicationId,
    environment,
  });
  const socialProviderState = buildExternalIdSocialProviderState(socialProviderConfiguration, {
    environment,
    userFlowDisplayName: localAccountState.userFlowDisplayName,
  });
  const credential = new DefaultAzureCredential({ tenantId });
  const graph = new MicrosoftGraphClient(async () => {
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    if (!token?.token) {
      throw new Error('Keyless Microsoft Graph authentication did not return an access token.');
    }
    return token.token;
  });
  const localAccountResult = await reconcileExternalIdLocalAccount(graph, localAccountState);
  const socialProviderResult = await reconcileExternalIdSocialProviders(graph, socialProviderState, {
    userFlowId: localAccountResult.userFlowId,
  });
  console.log(
    JSON.stringify(
      {
        applicationId,
        localAccountChanges: localAccountResult.changes,
        socialProviderChanges: socialProviderResult.changes,
        socialProviders: socialProviderResult.providers,
        userFlowDisplayName: localAccountResult.userFlowDisplayName,
        userFlowId: localAccountResult.userFlowId,
      },
      null,
      2,
    ),
  );
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
