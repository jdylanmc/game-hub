import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function validateAdversarialIdentityPolicy({ template, parameterFiles, deploymentScript, packageJson }) {
  const violations = [];
  const immutablePrefix = 'repo:${repositoryOwner}@${repositoryOwnerId}/${repositoryName}@${repositoryId}';
  const mutablePrefix = 'repo:jdylanmc/game-hub:environment:';
  const requiredTemplateFragments = [
    "extension 'br:mcr.microsoft.com/bicep/extensions/microsoftgraph/v1.0:1.0.0'",
    "targetScope = 'subscription'",
    "param repositoryOwner string = 'jdylanmc'",
    "param repositoryOwnerId string = '6954990'",
    "param repositoryName string = 'game-hub'",
    "param repositoryId string = '1330993568'",
    immutablePrefix,
    "resource application 'Microsoft.Graph/applications@v1.0' existing",
    "resource credential 'Microsoft.Graph/applications/federatedIdentityCredentials@v1.0'",
    "'https://token.actions.githubusercontent.com'",
    "'api://AzureADTokenExchange'",
  ];

  for (const fragment of requiredTemplateFragments) {
    if (!template.includes(fragment)) {
      violations.push(`Missing immutable federated identity invariant: ${fragment}`);
    }
  }

  const expectedParameters = {
    'adversarial-review': [
      "param applicationUniqueName = 'game-hub-adversarial-inference'",
      "param credentialName = 'github-adversarial-review'",
      "param githubEnvironment = 'adversarial-review'",
    ],
    test: [
      "param applicationUniqueName = 'game-hub-adversarial-deploy-test'",
      "param credentialName = 'github-test-environment'",
      "param githubEnvironment = 'test'",
    ],
    prod: [
      "param applicationUniqueName = 'game-hub-adversarial-deploy-prod'",
      "param credentialName = 'github-prod-environment'",
      "param githubEnvironment = 'prod'",
    ],
  };

  for (const [environment, fragments] of Object.entries(expectedParameters)) {
    const source = parameterFiles[environment];
    if (!source) {
      violations.push(`Missing federated identity parameters for ${environment}.`);
      continue;
    }
    for (const fragment of fragments) {
      if (!source.includes(fragment)) {
        violations.push(`Invalid ${environment} federated identity parameters: ${fragment}`);
      }
    }
  }

  const requiredDeploymentFragments = [
    'SUBSCRIPTION_ID="11213dbd-39fe-46ba-87db-5f5e8c449aed"',
    'BICEP_VERSION="v0.42.1"',
    'az account set --subscription "$SUBSCRIPTION_ID"',
    'test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"',
    'az deployment sub what-if',
    'az deployment sub create',
  ];
  for (const fragment of requiredDeploymentFragments) {
    if (!deploymentScript.includes(fragment)) {
      violations.push(`Missing federated identity deployment invariant: ${fragment}`);
    }
  }

  const combinedSources = [template, ...Object.values(parameterFiles), deploymentScript].join('\n');
  if (combinedSources.includes(mutablePrefix)) {
    violations.push('Federated identity configuration must not trust the mutable repository-name subject.');
  }
  if (
    packageJson.scripts?.['policy:adversarial-identity'] !== 'node scripts/check-adversarial-identity-policy.mjs' ||
    !packageJson.scripts?.['policy:check']?.includes('yarn policy:adversarial-identity')
  ) {
    violations.push('Immutable federated identity policy must be a mandatory repository gate.');
  }

  return violations;
}

const [template, adversarialReviewParameters, testParameters, prodParameters, deploymentScript, packageSource] =
  await Promise.all([
    fs.readFile(path.join(root, 'infra/bicep/federated-identity.bicep'), 'utf8'),
    fs.readFile(path.join(root, 'infra/federated-identity-adversarial-review.bicepparam'), 'utf8'),
    fs.readFile(path.join(root, 'infra/federated-identity-test.bicepparam'), 'utf8'),
    fs.readFile(path.join(root, 'infra/federated-identity-prod.bicepparam'), 'utf8'),
    fs.readFile(path.join(root, 'infra/deploy-federated-identity.sh'), 'utf8'),
    fs.readFile(path.join(root, 'package.json'), 'utf8'),
  ]);

const violations = validateAdversarialIdentityPolicy({
  template,
  parameterFiles: {
    'adversarial-review': adversarialReviewParameters,
    test: testParameters,
    prod: prodParameters,
  },
  deploymentScript,
  packageJson: JSON.parse(packageSource),
});

if (violations.length > 0) {
  throw new Error(`Adversarial identity policy failed:\n${violations.join('\n')}`);
}

console.log('Immutable adversarial identity policy passed.');

export { validateAdversarialIdentityPolicy };
