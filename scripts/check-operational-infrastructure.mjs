import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadOperationalInfrastructure(root = rootDirectory) {
  return {
    containerAppModule: readFileSync(path.join(root, 'infra/modules/container-app-api.bicep'), 'utf8'),
    environmentParameters: Object.fromEntries(
      ['dev', 'prod'].map((environment) => [
        environment,
        readFileSync(path.join(root, `infra/environments/${environment}.bicepparam`), 'utf8'),
      ]),
    ),
    mainTemplate: readFileSync(path.join(root, 'infra/main.bicep'), 'utf8'),
    observabilityModule: readFileSync(path.join(root, 'infra/modules/observability.bicep'), 'utf8'),
    secureConfigurationModule: readFileSync(path.join(root, 'infra/modules/secure-configuration.bicep'), 'utf8'),
  };
}

export function validateOperationalInfrastructure({
  containerAppModule,
  environmentParameters,
  mainTemplate,
  observabilityModule,
  secureConfigurationModule,
}) {
  const violations = [];

  for (const [needle, message] of [
    ['Microsoft.KeyVault/vaults@2024-11-01', 'Secure configuration must use Azure Key Vault.'],
    ['enableRbacAuthorization: true', 'Key Vault must use Azure role-based access control.'],
    ['enableSoftDelete: true', 'Key Vault soft delete must remain enabled.'],
    ["'4633458b-17de-408a-b874-0445c86b69e6'", 'The API runtime must retain the Key Vault Secrets User role.'],
    [
      "'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'",
      'The publication identity must retain the Key Vault Secrets Officer role.',
    ],
    [
      'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31',
      'Secure configuration publication must use OpenID Connect federation.',
    ],
    [
      'subject: configurationPublisherFederatedSubject',
      'The publication identity must use the immutable configured GitHub subject.',
    ],
  ]) {
    requireText(secureConfigurationModule, needle, message, violations);
  }

  for (const [needle, message] of [
    [
      "githubEnvironmentFederatedSubject = 'repo:jdylanmc@6954990/game-hub@1330993568:environment:${environmentName}'",
      'GitHub environment federation must bind immutable owner and repository identifiers.',
    ],
    [
      "module secureConfigurationModule './modules/secure-configuration.bicep'",
      'The entry point must compose secure configuration.',
    ],
    ["module observability './modules/observability.bicep'", 'The entry point must compose observability.'],
    ['output apiRuntimeIdentity object', 'The API runtime identity contract must be exposed.'],
    ['output secretPublisherIdentity object', 'The publication identity contract must be exposed.'],
    ['output secureConfiguration object', 'The non-secret Key Vault reference contract must be exposed.'],
    ['output monitoringConfiguration object', 'The monitoring contract must be exposed.'],
    ['output costControlConfiguration object', 'The cost guardrail contract must be exposed.'],
  ]) {
    requireText(mainTemplate, needle, message, violations);
  }

  for (const [needle, message] of [
    [
      'keyVaultUrl: secretReference.keyVaultSecretUri',
      'Container Apps secrets must resolve from Key Vault references.',
    ],
    ['identity: runtimeIdentityId', 'Key Vault references must use the dedicated runtime identity.'],
    ["'${runtimeIdentityId}': {}", 'The Container App must attach the dedicated runtime managed identity.'],
    ["destination: 'azure-monitor'", 'Container Apps logs must route through Azure Monitor without a workspace key.'],
    ['maxReplicas: maxReplicas', 'The API must retain an explicit maximum replica limit.'],
  ]) {
    requireText(containerAppModule, needle, message, violations);
  }

  for (const [needle, message] of [
    ['Microsoft.OperationalInsights/workspaces@2025-07-01', 'Observability must include a Log Analytics workspace.'],
    ['retentionInDays: retentionInDays', 'Monitoring retention must be explicit.'],
    ['dailyQuotaGb: dailyIngestionCapGb', 'Log ingestion must have an explicit daily cap.'],
    ['WorkspaceResourceId: logAnalyticsWorkspace.id', 'Application Insights must be workspace based.'],
    ['SamplingPercentage: applicationInsightsSamplingPercentage', 'Application sampling must be explicit.'],
    ["categoryGroup: 'allLogs'", 'Platform diagnostic logs must be enabled.'],
    ["categoryGroup: 'audit'", 'Key Vault audit diagnostics must be enabled.'],
    ["category: 'AllMetrics'", 'Platform metrics must be enabled.'],
    ['resource staticWebAppDiagnostics', 'Frontend diagnostics must be configured.'],
    ['resource containerRegistryDiagnostics', 'Registry diagnostics must be configured.'],
    ['resource containerAppsEnvironmentDiagnostics', 'Container Apps system logs must be configured.'],
    ['resource containerAppDiagnostics', 'Container App metrics must be configured.'],
    ['resource blobServiceDiagnostics', 'Blob diagnostics must be configured.'],
    ['resource frontDoorDiagnostics', 'Front Door diagnostics must be configured.'],
    ['resource keyVaultDiagnostics', 'Key Vault diagnostics must be configured.'],
  ]) {
    requireText(observabilityModule, needle, message, violations);
  }

  for (const [environment, parameters] of Object.entries(environmentParameters)) {
    for (const needle of [
      'param apiKeyVaultSecretReferences = []',
      'param apiSecretEnvironmentReferences = []',
      'param keyVaultSoftDeleteRetentionDays = ',
      'param keyVaultPurgeProtectionEnabled = ',
      'param monitoringRetentionDays = 30',
      'param monitoringDailyIngestionCapGb = ',
      'param applicationInsightsSamplingPercentage = ',
      "costProfile: '",
      "dataClassification: 'non-sensitive'",
      "lifecycle: '",
    ]) {
      requireText(parameters, needle, `The ${environment} environment must define ${needle.trim()}.`, violations);
    }
  }

  requireText(
    environmentParameters.dev,
    'param apiMinReplicas = 0\nparam apiMaxReplicas = 2',
    'Development must retain scale-to-zero with a two-replica ceiling.',
    violations,
  );
  requireText(
    environmentParameters.prod,
    'param apiMinReplicas = 1\nparam apiMaxReplicas = 5',
    'Production must retain one warm replica with a five-replica ceiling.',
    violations,
  );
  requireText(
    environmentParameters.prod,
    'param keyVaultPurgeProtectionEnabled = true',
    'Production Key Vault purge protection must remain enabled.',
    violations,
  );

  const operationalSources = [
    containerAppModule,
    mainTemplate,
    observabilityModule,
    secureConfigurationModule,
    ...Object.values(environmentParameters),
  ].join('\n');

  if (operationalSources.includes('Microsoft.KeyVault/vaults/secrets')) {
    violations.push('Hosting infrastructure must not declare secret values.');
  }

  for (const forbidden of [
    /clientSecret/i,
    /connectionString/i,
    /instrumentationKey/i,
    /sharedAccessSignature/i,
    /sharedKey/i,
    /accountKey/i,
    /repositoryToken/i,
    /sasToken/i,
    /secretValue/i,
  ]) {
    if (forbidden.test(operationalSources)) {
      violations.push(`Operational infrastructure contains forbidden credential field: ${forbidden.source}.`);
    }
  }

  return violations;
}

function requireText(source, needle, message, violations) {
  if (!source.includes(needle)) violations.push(message);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const violations = validateOperationalInfrastructure(loadOperationalInfrastructure());
  if (violations.length > 0) {
    throw new Error(`Operational infrastructure policy failed:\n- ${violations.join('\n- ')}`);
  }
  console.log('Operational infrastructure policy passed.');
}
