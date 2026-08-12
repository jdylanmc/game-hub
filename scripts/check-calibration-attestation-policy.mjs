#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function validateCalibrationAttestationPolicy({ policy, packageJson, source, promotionPolicy, workflow }) {
  const violations = [];
  const requiredRootProperties = [
    'attestationAction',
    'azureDeployment',
    'digestAlgorithm',
    'freshness',
    'minimumGitHubCliVersion',
    'predicateType',
    'repository',
    'requiredReportFingerprintComponents',
    'trustedBuilder',
    'version',
  ];
  if (JSON.stringify(Object.keys(policy).sort()) !== JSON.stringify(requiredRootProperties)) {
    violations.push('Calibration attestation policy properties are incomplete or undeclared.');
  }
  if (
    policy.version !== '1.0.0' ||
    policy.predicateType !== 'https://jdylanmc.github.io/game-hub/attestations/adversarial-calibration/v1' ||
    policy.digestAlgorithm !== 'sha256' ||
    policy.minimumGitHubCliVersion !== '2.92.0'
  ) {
    violations.push('Calibration attestation schema, digest, or verifier version was weakened.');
  }
  if (
    policy.attestationAction?.repository !== 'actions/attest' ||
    policy.attestationAction?.version !== 'v4.2.2' ||
    policy.attestationAction?.commit !== '1e69f48acb82d1966a394da916b4c1698aa569d6'
  ) {
    violations.push('GitHub attestation generation must use the reviewed immutable action commit.');
  }
  if (
    policy.repository?.nameWithOwner !== 'jdylanmc/game-hub' ||
    policy.repository?.ownerId !== '6954990' ||
    policy.repository?.repositoryId !== '1330993568' ||
    policy.repository?.visibility !== 'public' ||
    policy.repository?.protectedRef !== 'refs/heads/main'
  ) {
    violations.push('Calibration attestation repository identity is not immutable and exact.');
  }
  if (
    policy.trustedBuilder?.workflowName !== 'Adversarial calibration' ||
    policy.trustedBuilder?.workflowPath !== '.github/workflows/adversarial-calibration.yml' ||
    policy.trustedBuilder?.signerWorkflow !== 'jdylanmc/game-hub/.github/workflows/adversarial-calibration.yml' ||
    policy.trustedBuilder?.subjectAlternativeName !==
      'https://github.com/jdylanmc/game-hub/.github/workflows/adversarial-calibration.yml@refs/heads/main' ||
    policy.trustedBuilder?.environment !== 'adversarial-review' ||
    policy.trustedBuilder?.event !== 'workflow_dispatch' ||
    policy.trustedBuilder?.runnerEnvironment !== 'github-hosted' ||
    policy.trustedBuilder?.oidcIssuer !== 'https://token.actions.githubusercontent.com' ||
    policy.trustedBuilder?.workloadIdentitySubject !==
      'repo:jdylanmc@6954990/game-hub@1330993568:environment:adversarial-review'
  ) {
    violations.push('Calibration attestation signer or protected workload identity was weakened.');
  }
  if (
    policy.azureDeployment?.subscriptionId !== '11213dbd-39fe-46ba-87db-5f5e8c449aed' ||
    policy.azureDeployment?.resourceId !==
      '/subscriptions/11213dbd-39fe-46ba-87db-5f5e8c449aed/resourceGroups/game-hub-adversarial-agents-prod/providers/Microsoft.CognitiveServices/accounts/game-hub-adversarial-openai/deployments/game-hub-gilfoyle-security-architect' ||
    policy.azureDeployment?.endpoint !== 'https://game-hub-adversarial-openai.openai.azure.com' ||
    policy.azureDeployment?.deploymentId !== 'game-hub-gilfoyle-security-architect' ||
    policy.azureDeployment?.modelName !== 'gpt-4.1-mini' ||
    policy.azureDeployment?.modelVersion !== '2025-04-14' ||
    policy.azureDeployment?.modelSku !== 'GlobalStandard' ||
    policy.azureDeployment?.region !== 'eastus' ||
    policy.azureDeployment?.credentialScope !== 'https://cognitiveservices.azure.com/.default'
  ) {
    violations.push('Calibration attestation Azure deployment identity was weakened.');
  }
  if (
    policy.freshness?.maximumAttestationAgeSeconds !== 1800 ||
    policy.freshness?.maximumClockSkewSeconds !== 300 ||
    policy.freshness?.maximumWorkflowDurationSeconds !== 14400
  ) {
    violations.push('Calibration attestation freshness or workflow bounds were weakened.');
  }
  const requiredComponents = [
    'architectureContentHash',
    'benchmarkCorpusContentHash',
    'benchmarkCorpusVersion',
    'contextConfigContentHash',
    'contextConfigVersion',
    'modelDeployment',
    'modelVersion',
    'policyContentHash',
    'policyVersion',
    'promotionPolicyContentHash',
    'promotionPolicyVersion',
    'promptContentHash',
    'promptVersion',
    'reviewerEngineConfigContentHash',
    'reviewerEngineConfigVersion',
    'schemaContentHash',
    'schemaVersion',
    'systemPolicyContentHash',
    'systemPolicyVersion',
    'toolsConfigContentHash',
    'toolsVersion',
  ];
  if (
    !Array.isArray(policy.requiredReportFingerprintComponents) ||
    JSON.stringify([...policy.requiredReportFingerprintComponents].sort()) !== JSON.stringify(requiredComponents)
  ) {
    violations.push('Calibration reports do not bind every required registered configuration fingerprint.');
  }
  const requiredSourceFragments = [
    "executor('gh', [",
    "'attestation'",
    "'verify'",
    "'--bundle'",
    "'--signer-workflow'",
    "'--source-ref'",
    "'--source-digest'",
    "'--signer-digest'",
    "'--cert-oidc-issuer'",
    "'--deny-self-hosted-runners'",
    "'--no-public-good'",
    "'--predicate-type'",
    "'--format'",
    "'json'",
    'verifiedOutput.length !== 1',
    'verificationResult.verifiedTimestamps',
    'certificate[field] !== expectedValue',
    'statement.subject.length !== 1',
    'context.workflowSha !== context.headSha',
    "strategy: 'exact-protected-run-and-artifact'",
    'fs.writeFileSync(outputPath',
    "{ flag: 'wx' }",
  ];
  for (const fragment of requiredSourceFragments) {
    if (!source.includes(fragment)) {
      violations.push(`Calibration attestation verifier is missing fail-closed invariant: ${fragment}`);
    }
  }
  if (
    source.includes('shell: true') ||
    source.includes('exec(') ||
    source.includes('continue-on-error') ||
    source.includes('ACTIONS_ID_TOKEN_REQUEST_TOKEN') ||
    source.includes('AZURE_ACCESS_TOKEN')
  ) {
    violations.push('Calibration attestation implementation may expose tokens or weaken command isolation.');
  }
  if (
    packageJson.scripts?.['calibration:attestation:create'] !== 'node scripts/calibration-attestation.ts create' ||
    packageJson.scripts?.['calibration:attestation:verify'] !== 'node scripts/calibration-attestation.ts verify' ||
    packageJson.scripts?.['policy:calibration-attestation'] !==
      'node scripts/check-calibration-attestation-policy.mjs' ||
    !String(packageJson.scripts?.['policy:check']).includes('yarn policy:calibration-attestation')
  ) {
    violations.push('Calibration attestation commands are not mandatory repository policy.');
  }
  if (
    promotionPolicy.status !== 'calibration-required' ||
    promotionPolicy.promotionAllowed !== false ||
    promotionPolicy.requiredRunMode !== 'azure' ||
    promotionPolicy.minimumCases !== 24 ||
    promotionPolicy.minimumRepetitionsPerCase !== 2 ||
    promotionPolicy.thresholds?.minimumBlockingPatternDetectionRate !== 1 ||
    promotionPolicy.thresholds?.maximumStrongFalsePositiveRate !== 0.05 ||
    promotionPolicy.thresholds?.maximumAdvisoryEscalationRate !== 0 ||
    promotionPolicy.thresholds?.maximumMissedCriticalScenarios !== 0 ||
    promotionPolicy.thresholds?.maximumMissedControlBypassCases !== 0 ||
    promotionPolicy.thresholds?.minimumReviewerAgreementRate !== 0.95 ||
    promotionPolicy.thresholds?.maximumAverageCostUsd !== 0.1 ||
    promotionPolicy.thresholds?.maximumTotalCostUsd !== 0.25 ||
    promotionPolicy.thresholds?.maximumP95LatencyMs !== 60000 ||
    promotionPolicy.thresholds?.maximumErrorRate !== 0
  ) {
    violations.push('Gilfoyle promotion thresholds must remain strict and unpromoted without valid evidence.');
  }
  const workflowFragments = [
    'name: Adversarial calibration',
    'workflow_dispatch:',
    "if: github.ref == 'refs/heads/main'",
    'environment: adversarial-review',
    'attestations: write',
    'contents: read',
    'id-token: write',
    'group: adversarial-calibration-protected',
    'cancel-in-progress: false',
    'ADVERSARIAL_AGENT_NAME: gilfoyle-security-architect',
    "ADVERSARIAL_CALIBRATION_MODE: 'true'",
    'AZURE_OPENAI_DEPLOYMENT_ID: game-hub-gilfoyle-security-architect',
    'subscription-id: 11213dbd-39fe-46ba-87db-5f5e8c449aed',
    'yarn install --immutable',
    '--mode azure',
    '--agent gilfoyle-security-architect',
    '--repetitions 2',
    'yarn calibration:check',
    'uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    'retention-days: 90',
    'yarn calibration:attestation:create',
    'uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6',
    'yarn calibration:attestation:verify',
  ];
  for (const fragment of workflowFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(`Protected calibration workflow is missing invariant: ${fragment}`);
    }
  }
  if (
    workflow.includes('pull_request_target') ||
    workflow.includes('continue-on-error') ||
    workflow.includes('AZURE_OPENAI_API_KEY') ||
    workflow.includes('OPENAI_API_KEY') ||
    workflow.includes('client-secret') ||
    workflow.includes('write-all')
  ) {
    violations.push('Protected calibration workflow exposes credentials or weakens fail-closed execution.');
  }
  for (const line of workflow.split('\n')) {
    const actionReference = line.match(/^\s*uses:\s*[^@\s]+@([^\s#]+)/);
    if (actionReference && !/^[0-9a-f]{40}$/.test(actionReference[1])) {
      violations.push(`Calibration action is not pinned to an immutable commit: ${line.trim()}`);
    }
  }
  return violations;
}

const policy = JSON.parse(
  fs.readFileSync(
    path.join(root, 'config/adversarial-agents/gilfoyle-security-architect/calibration-attestation-policy.json'),
    'utf8',
  ),
);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'scripts/calibration-attestation.ts'), 'utf8');
const promotionPolicy = JSON.parse(
  fs.readFileSync(
    path.join(root, 'config/adversarial-agents/gilfoyle-security-architect/promotion-policy.json'),
    'utf8',
  ),
);
const workflow = fs.readFileSync(path.join(root, '.github/workflows/adversarial-calibration.yml'), 'utf8');
const violations = validateCalibrationAttestationPolicy({
  policy,
  packageJson,
  source,
  promotionPolicy,
  workflow,
});
if (violations.length > 0) {
  throw new Error(`Calibration attestation policy failed:\n${violations.join('\n')}`);
}

console.log('Calibration attestation policy passed.');

export { validateCalibrationAttestationPolicy };
