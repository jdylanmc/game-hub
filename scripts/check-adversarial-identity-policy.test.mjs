import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateAdversarialIdentityPolicy } from './check-adversarial-identity-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(path.join(root, 'infra/bicep/federated-identity.bicep'), 'utf8');
const parameterFiles = Object.fromEntries(
  ['adversarial-review', 'test', 'prod'].map((environment) => [
    environment,
    readFileSync(path.join(root, `infra/federated-identity-${environment}.bicepparam`), 'utf8'),
  ]),
);
const deploymentScript = readFileSync(path.join(root, 'infra/deploy-federated-identity.sh'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function violations(overrides = {}) {
  return validateAdversarialIdentityPolicy({
    template,
    parameterFiles,
    deploymentScript,
    packageJson,
    ...overrides,
  });
}

describe('adversarial identity policy', () => {
  it('accepts exact immutable protected-environment subjects', () => {
    expect(violations()).toEqual([]);
  });

  it.each([
    [
      'owner ID',
      template.replace("param repositoryOwnerId string = '6954990'", "param repositoryOwnerId string = '1'"),
    ],
    ['repository ID', template.replace("param repositoryId string = '1330993568'", "param repositoryId string = '1'")],
    [
      'mutable subject',
      template.replace(
        "'repo:${repositoryOwner}@${repositoryOwnerId}/${repositoryName}@${repositoryId}:environment:${githubEnvironment}'",
        "'repo:jdylanmc/game-hub:environment:${githubEnvironment}'",
      ),
    ],
    ['unpinned Graph extension', template.replace('microsoftgraph/v1.0:1.0.0', 'microsoftgraph/v1.0:latest')],
  ])('rejects a weakened %s', (_label, templateValue) => {
    expect(violations({ template: templateValue })).not.toEqual([]);
  });

  it('rejects an environment mapped to the wrong application', () => {
    expect(
      violations({
        parameterFiles: {
          ...parameterFiles,
          prod: parameterFiles.prod.replace('game-hub-adversarial-deploy-prod', 'game-hub-adversarial-deploy-test'),
        },
      }),
    ).not.toEqual([]);
  });

  it('rejects deployment without the explicit subscription guard', () => {
    expect(
      violations({
        deploymentScript: deploymentScript.replace(
          'test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"',
          'true',
        ),
      }),
    ).not.toEqual([]);
  });
});
