import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadDeploymentAutomation(root = rootDirectory) {
  const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
  return {
    apiWorkflow: read('.github/workflows/deploy-api-image.yml'),
    assetWorkflow: read('.github/workflows/deploy-assets.yml'),
    bootstrapParameters: `${read('infra/bootstrap/dev.bicepparam')}\n${read('infra/bootstrap/prod.bicepparam')}`,
    bootstrapTemplate: read('infra/bootstrap/main.bicep'),
    documentation: read('infra/README.md'),
    externalIdentityWorkflow: read('.github/workflows/configure-external-id.yml'),
    frontendWorkflow: read('.github/workflows/deploy-frontend.yml'),
    infrastructureWorkflow: read('.github/workflows/deploy-hosting-infrastructure.yml'),
    mainTemplate: read('infra/main.bicep'),
    publisherModule: read('infra/modules/deployment-publishers.bicep'),
    workloadRoleModule: read('infra/bootstrap/workload-role-assignments.bicep'),
  };
}

export function validateDeploymentAutomation({
  apiWorkflow,
  assetWorkflow,
  bootstrapParameters,
  bootstrapTemplate,
  documentation,
  externalIdentityWorkflow,
  frontendWorkflow,
  infrastructureWorkflow,
  mainTemplate,
  publisherModule,
  workloadRoleModule,
}) {
  const violations = [];
  const workflows = {
    API: apiWorkflow,
    assets: assetWorkflow,
    frontend: frontendWorkflow,
    infrastructure: infrastructureWorkflow,
  };

  for (const [name, workflow] of Object.entries(workflows)) {
    for (const [needle, message] of [
      ['workflow_dispatch:', `${name} deployment must use an explicit protected release dispatch.`],
      ["if: github.ref == 'refs/heads/main'", `${name} deployment must reject non-main refs.`],
      ['environment: ${{ inputs.environment }}', `${name} deployment must use the selected protected environment.`],
      ['contents: read', `${name} deployment must retain read-only repository access.`],
      ['id-token: write', `${name} deployment must use OpenID Connect.`],
      [
        "AZURE_SUBSCRIPTION_ID: '11213dbd-39fe-46ba-87db-5f5e8c449aed'",
        `${name} deployment must pin the approved Azure subscription.`,
      ],
      ['azure/login@f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca', `${name} deployment must use pinned Azure login.`],
      ['az account set --subscription "$AZURE_SUBSCRIPTION_ID"', `${name} deployment must select the subscription.`],
      [
        'test "$(az account show --query id --output tsv)" = "$AZURE_SUBSCRIPTION_ID"',
        `${name} deployment must verify the selected subscription.`,
      ],
      ['persist-credentials: false', `${name} deployment checkout must not retain a GitHub credential.`],
    ]) {
      requireText(workflow, needle, message, violations);
    }

    if (workflow.includes('${{ secrets.')) {
      violations.push(`${name} deployment must not depend on a stored GitHub secret.`);
    }
    for (const forbidden of [
      '--account-key',
      '--sas-token',
      '--password',
      'client-secret:',
      'list-credentials',
      'admin-enabled true',
    ]) {
      if (workflow.toLowerCase().includes(forbidden)) {
        violations.push(`${name} deployment contains a forbidden credential path: ${forbidden}.`);
      }
    }
    for (const line of workflow.split('\n')) {
      const actionReference = line.match(/^\s*uses:\s*[^@\s]+@([^\s#]+)/);
      if (actionReference && !/^[0-9a-f]{40}$/.test(actionReference[1])) {
        violations.push(`${name} action reference is not pinned to a full commit SHA: ${line.trim()}`);
      }
    }
  }

  for (const [needle, message] of [
    ['az deployment sub validate', 'Infrastructure deployment must validate the template.'],
    ['az deployment sub what-if', 'Infrastructure deployment must preview changes.'],
    ['az deployment sub create', 'Infrastructure deployment must apply the idempotent template.'],
    ['repeat-deployment-what-if.json', 'Infrastructure deployment must retain a repeated preview.'],
    [
      '.changeType != "NoChange" and .changeType != "Ignore"',
      'Infrastructure deployment must fail when repeat deployment would change resources.',
    ],
    ['deployment-outputs.json', 'Infrastructure deployment must retain non-secret outputs.'],
  ]) {
    requireText(infrastructureWorkflow, needle, message, violations);
  }
  if (occurrences(infrastructureWorkflow, 'az deployment sub what-if') !== 2) {
    violations.push('Infrastructure deployment must perform exactly one preview before and after deployment.');
  }

  for (const [needle, message] of [
    ['vars.AZURE_FRONTEND_CLIENT_ID', 'Frontend publication must use its dedicated keyless identity.'],
    ['yarn install --immutable', 'Frontend publication must build from an immutable dependency graph.'],
    ['yarn build', 'Frontend publication must build the reviewed Vite artifact.'],
    ['X-Azure-FDID', 'Frontend publication must inject the Front Door identifier.'],
    ['AzureFrontDoor.Backend', 'Frontend publication must restrict the origin to Front Door.'],
    [
      'scripts/render-external-id-static-web-app-config.mjs',
      'Frontend publication must render the reviewed External ID provider.',
    ],
    [
      'GAME_HUB_EXTERNAL_ID_CLIENT_ID="$GAME_HUB_EXTERNAL_ID_CLIENT_ID"',
      'Frontend publication must set only the non-secret External ID application ID.',
    ],
    [
      'clientSecretCertificateKeyVaultReference',
      'Frontend publication must use an Azure Key Vault certificate reference.',
    ],
    ['az staticwebapp secrets list', 'Frontend publication must resolve its service token at runtime.'],
    ['echo "::add-mask::$deployment_token"', 'Frontend publication must mask its runtime service token.'],
    [
      'Azure/static-web-apps-deploy@1a947af9992250f3bc2e68ad0754c0b0c11566c9',
      'Frontend publication must pin the Static Web Apps publisher.',
    ],
    ['skip_app_build: true', 'Frontend publication must deploy the already-reviewed artifact.'],
  ]) {
    requireText(frontendWorkflow, needle, message, violations);
  }

  for (const [needle, message] of [
    ['workflow_dispatch:', 'External ID configuration must use an explicit protected release dispatch.'],
    ["if: github.ref == 'refs/heads/main'", 'External ID configuration must reject non-main refs.'],
    ['environment: ${{ inputs.environment }}', 'External ID configuration must use a protected environment.'],
    ['contents: read', 'External ID configuration must retain read-only repository access.'],
    ['id-token: write', 'External ID configuration must use OpenID Connect.'],
    ['vars.EXTERNAL_ID_CONFIG_CLIENT_ID', 'External ID configuration must use its dedicated keyless identity.'],
    ['vars.EXTERNAL_ID_TENANT_ID', 'External ID configuration must select the external tenant explicitly.'],
    ['vars.EXTERNAL_ID_APP_ID', 'External ID configuration must link the non-secret customer application ID.'],
    ['vars.EXTERNAL_ID_GOOGLE_CLIENT_ID', 'External ID configuration must use the non-secret Google client ID.'],
    ['vars.EXTERNAL_ID_FACEBOOK_CLIENT_ID', 'External ID configuration must use the non-secret Facebook client ID.'],
    ['vars.AZURE_SECRET_CLIENT_ID', 'External ID configuration must use the dedicated Key Vault identity.'],
    [
      "AZURE_SUBSCRIPTION_ID: '11213dbd-39fe-46ba-87db-5f5e8c449aed'",
      'External ID configuration must pin the provider credential subscription.',
    ],
    [
      'az account set --subscription "$AZURE_SUBSCRIPTION_ID"',
      'External ID configuration must select the provider credential subscription.',
    ],
    [
      'test "$(az account show --query id --output tsv)" = "$AZURE_SUBSCRIPTION_ID"',
      'External ID configuration must verify the provider credential subscription.',
    ],
    [
      'config/authentication/external-id-social-providers.json',
      'External ID configuration must use reviewed provider secret references.',
    ],
    ['az keyvault secret show', 'External ID configuration must retrieve provider credentials from Azure Key Vault.'],
    ['echo "::add-mask::$google_client_secret"', 'External ID configuration must mask the Google credential.'],
    ['echo "::add-mask::$facebook_client_secret"', 'External ID configuration must mask the Facebook credential.'],
    ['ACTIONS_ID_TOKEN_REQUEST_URL', 'External ID configuration must obtain a fresh GitHub OpenID Connect assertion.'],
    ['--federated-token', 'External ID configuration must use workload identity for the external tenant.'],
    ['--allow-no-subscriptions', 'External ID configuration must not require an external-tenant subscription.'],
    ['yarn auth:check', 'External ID configuration must validate the reviewed desired state.'],
    [
      'az account get-access-token',
      'External ID configuration must verify its Microsoft Graph tenant without exposing the token.',
    ],
    [
      ')" = "$GAME_HUB_EXTERNAL_ID_TENANT_ID"',
      'External ID configuration must bind Microsoft Graph to the selected external tenant.',
    ],
    ['yarn auth:configure', 'External ID configuration must reconcile the customer user flow.'],
    [
      'GAME_HUB_GOOGLE_CLIENT_SECRET="$google_client_secret"',
      'External ID configuration must pass the Google credential only to the reconciliation process.',
    ],
    [
      'GAME_HUB_FACEBOOK_CLIENT_SECRET="$facebook_client_secret"',
      'External ID configuration must pass the Facebook credential only to the reconciliation process.',
    ],
    [
      'unset google_client_secret facebook_client_secret',
      'External ID configuration must clear provider credentials after reconciliation.',
    ],
    ['persist-credentials: false', 'External ID checkout must not retain a GitHub credential.'],
    [
      'azure/login@f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca',
      'External ID configuration must use pinned keyless Azure login.',
    ],
  ]) {
    requireText(externalIdentityWorkflow, needle, message, violations);
  }
  if (externalIdentityWorkflow.includes('${{ secrets.')) {
    violations.push('External ID configuration must not depend on a stored GitHub secret.');
  }
  for (const forbidden of ['$GITHUB_ENV', '$GITHUB_OUTPUT']) {
    if (externalIdentityWorkflow.includes(forbidden)) {
      violations.push(`External ID configuration must not persist provider credentials through ${forbidden}.`);
    }
  }
  for (const line of externalIdentityWorkflow.split('\n')) {
    const actionReference = line.match(/^\s*uses:\s*[^@\s]+@([^\s#]+)/);
    if (actionReference && !/^[0-9a-f]{40}$/.test(actionReference[1])) {
      violations.push(`External ID action reference is not pinned to a full commit SHA: ${line.trim()}`);
    }
  }

  for (const [needle, message] of [
    ['vars.AZURE_API_CLIENT_ID', 'API publication must use its dedicated keyless identity.'],
    ['test -f api/Dockerfile', 'API publication must fail until reviewed API source exists.'],
    ['az acr login --name', 'API publication must authenticate to the registry with Microsoft Entra ID.'],
    ['docker push "$image_tag"', 'API publication must push the reviewed commit image.'],
    ['az acr repository show', 'API publication must resolve the immutable image digest.'],
    ['az containerapp update', 'API publication must update Azure Container Apps.'],
    ['test "$deployed_image" = "$GAME_HUB_API_IMAGE"', 'API publication must verify the deployed digest.'],
  ]) {
    requireText(apiWorkflow, needle, message, violations);
  }

  for (const [needle, message] of [
    ['vars.AZURE_ASSET_CLIENT_ID', 'Asset publication must use its dedicated keyless identity.'],
    ['case "$resolved_path/"', 'Asset publication must reject paths outside the repository.'],
    ['az storage blob upload-batch', 'Asset publication must upload reviewed directories.'],
    ['--auth-mode login', 'Asset publication must use Microsoft Entra data-plane authorization.'],
    ['az afd endpoint purge', 'Asset publication must purge changed mutable Front Door paths.'],
  ]) {
    requireText(assetWorkflow, needle, message, violations);
  }

  for (const [needle, message] of [
    [
      "param federatedSubject = 'repo:jdylanmc@6954990/game-hub@1330993568:environment:",
      'Bootstrap parameters must use immutable protected-environment federation.',
    ],
    [
      "'Microsoft.Resources/deployments/*'",
      'The bootstrap identity must receive the narrow subscription deployment action.',
    ],
    [
      "'f58310d9-a9f6-439a-9e8d-f62e7b41a168'",
      'The bootstrap identity must retain resource-group-scoped role administration.',
    ],
    [
      "module deploymentPublishers './modules/deployment-publishers.bicep'",
      'The main stack must compose application publication identities.',
    ],
    [
      'output deploymentPublisherIdentities object',
      'The main stack must expose the non-secret publisher identity contract.',
    ],
  ]) {
    const source = needle.startsWith('param federatedSubject')
      ? bootstrapParameters
      : `${bootstrapTemplate}\n${workloadRoleModule}\n${mainTemplate}`;
    requireText(source, needle, message, violations);
  }

  for (const [needle, message] of [
    ["'8311e382-0749-4cb8-b61a-304f252e45ec'", 'The API publisher must retain AcrPush.'],
    ['resource frontendPublisherFederatedCredential', 'The frontend publisher must use OpenID Connect federation.'],
    ['resource apiPublisherFederatedCredential', 'The API publisher must use OpenID Connect federation.'],
    ['scope: staticWebApp', 'Frontend control-plane access must be scoped to Static Web Apps.'],
    ['scope: containerRegistry', 'API registry access must be scoped to Azure Container Registry.'],
    ['scope: containerApp', 'API deployment access must be scoped to the Container App.'],
    ['scope: frontDoorProfile', 'Mutable asset purge access must be scoped to Azure Front Door.'],
  ]) {
    requireText(publisherModule, needle, message, violations);
  }

  for (const [needle, message] of [
    ['## Bootstrap protected deployment identities', 'Deployment bootstrap instructions are missing.'],
    ['## Deployment workflow order', 'Deployment workflow ordering is missing.'],
    ['## End-to-end verification procedure', 'End-to-end verification instructions are missing.'],
    ['### 1. Select the subscription and inspect outputs', 'Output verification is missing.'],
    ['### 2. Verify frontend reachability and origin protection', 'Frontend verification is missing.'],
    ['### 3. Verify frontend-to-API and authentication readiness', 'API and authentication verification is missing.'],
    ['### 4. Verify asset upload and Azure Front Door delivery', 'Asset delivery verification is missing.'],
    ['### 5. Verify the ingress policy', 'Ingress protection verification is missing.'],
    ['### 6. Verify secure runtime injection without reading values', 'Runtime injection verification is missing.'],
    ['### 7. Repeat the deployment', 'Repeat-deployment verification is missing.'],
    ['procedure, not evidence', 'Documentation must distinguish procedure from live Azure evidence.'],
  ]) {
    requireText(documentation, needle, message, violations);
  }

  return violations;
}

function requireText(source, needle, message, violations) {
  if (!source.includes(needle)) violations.push(message);
}

function occurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const violations = validateDeploymentAutomation(loadDeploymentAutomation());
  if (violations.length > 0) {
    throw new Error(`Deployment automation policy failed:\n- ${violations.join('\n- ')}`);
  }
  console.log('Keyless deployment automation and verification policy passed.');
}
