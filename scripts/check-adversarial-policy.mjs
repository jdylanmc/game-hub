import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(root, '.github/workflows/deploy-adversarial-infrastructure.yml'), 'utf8');
const bicep = await fs.readFile(path.join(root, 'infra/bicep/resources.bicep'), 'utf8');
const mainBicep = await fs.readFile(path.join(root, 'infra/bicep/main.bicep'), 'utf8');
const agentConfig = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/agents-config.json'), 'utf8'),
);
const collectorConfig = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/context-collector.json'), 'utf8'),
);
const collector = await fs.readFile(path.join(root, 'scripts/collect-adversarial-context.ts'), 'utf8');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const reviewerConfig = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/reviewer-engine.json'), 'utf8'),
);
const reviewerEngine = await fs.readFile(path.join(root, 'scripts/review-adversarial-context.ts'), 'utf8');
const systemPolicy = await fs.readFile(path.join(root, reviewerConfig.systemPolicyFile), 'utf8');
const verdictPolicy = JSON.parse(await fs.readFile(path.join(root, 'config/adversarial-agents/policy.json'), 'utf8'));
const benchmarkCorpus = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/benchmarks.json'), 'utf8'),
);
const promotionPolicy = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/promotion-policy.json'), 'utf8'),
);
const evaluator = await fs.readFile(path.join(root, 'scripts/evaluate-adversarial-reviewer.ts'), 'utf8');
const publisherConfig = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/github-publisher.json'), 'utf8'),
);
const publisher = await fs.readFile(path.join(root, 'scripts/publish-adversarial-evidence.ts'), 'utf8');
const exceptionSchema = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/exception-schema.json'), 'utf8'),
);
const exceptionRegistry = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/exceptions.json'), 'utf8'),
);
const exceptionEvaluator = await fs.readFile(path.join(root, 'scripts/apply-adversarial-exceptions.ts'), 'utf8');
const agentRegistrySchema = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/agent-registry-schema.json'), 'utf8'),
);
const agentRegistryValidator = await fs.readFile(
  path.join(root, 'scripts/validate-adversarial-agent-registry.ts'),
  'utf8',
);
const workflowDirectory = path.join(root, '.github/workflows');
const workflowSources = await Promise.all(
  (await fs.readdir(workflowDirectory))
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => fs.readFile(path.join(workflowDirectory, name), 'utf8')),
);
const violations = [];

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "if: github.ref == 'refs/heads/main'",
  'environment: ${{ inputs.environment }}',
  'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  'uses: azure/login@f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca',
  'uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'AZURE_REVIEWER_PRINCIPAL_ID: ${{ vars.AZURE_REVIEWER_PRINCIPAL_ID }}',
  'az deployment sub create',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    violations.push(`Missing protected deployment invariant: ${fragment}`);
  }
}

if (/^\s{2}(push|pull_request|pull_request_target):\s*$/m.test(workflow)) {
  violations.push('Adversarial infrastructure deployment must be manually dispatched only.');
}
if (workflow.includes('gh secret') || workflow.includes('openai-key') || workflow.includes('listKeys')) {
  violations.push('Deployment workflow must not retrieve keys or configure repository secrets.');
}
for (const line of workflow.split('\n')) {
  const match = line.match(/^\s*uses:\s*[^@\s]+@([^\s#]+)/);
  if (match && !/^[0-9a-f]{40}$/.test(match[1])) {
    violations.push(`Action reference is not immutable: ${line.trim()}`);
  }
}

const requiredBicepFragments = [
  "targetScope = 'subscription'",
  "module inference './resources.bicep'",
  "resource budget 'Microsoft.Consumption/budgets@2024-08-01'",
  'contactEmails: budgetContactEmails',
  "var modelName = 'gpt-4.1-mini'",
  "var modelVersion = '2025-04-14'",
  "var modelSku = 'GlobalStandard'",
  'disableLocalAuth: true',
  '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd',
];
const combinedBicep = `${mainBicep}\n${bicep}`;
for (const fragment of requiredBicepFragments) {
  if (!combinedBicep.includes(fragment)) {
    violations.push(`Missing Azure infrastructure invariant: ${fragment}`);
  }
}
if (combinedBicep.includes('listKeys') || combinedBicep.includes('Microsoft.KeyVault')) {
  violations.push('Inference infrastructure must use Microsoft Entra ID without static model keys.');
}

const reviewer = agentConfig.agents?.find((agent) => agent.name === 'unit-test-reviewer');
if (reviewer?.executionConfig?.maxConcurrentReviews !== 3) {
  violations.push('Production reviewer runtime concurrency must be fixed at three.');
}
if (reviewer?.modelDeployment !== 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard') {
  violations.push('Registry model attribution must match the deployed Azure model exactly.');
}

const requiredContextSections = [
  'contracts',
  'manifests',
  'generators',
  'workflows',
  'validationConfig',
  'relevantTests',
];
for (const section of requiredContextSections) {
  if (!collectorConfig.sections?.[section]?.mandatory) {
    violations.push(`Context collector section must be mandatory: ${section}`);
  }
}
if (
  collectorConfig.version !== '1.0.0' ||
  collectorConfig.limits?.maxPacketBytes > 1048576 ||
  collectorConfig.limits?.maxEvidenceBytes > 262144 ||
  collectorConfig.limits?.maxFileBytes > 32768 ||
  collectorConfig.limits?.maxPatchBytes > 65536
) {
  violations.push('Context collector version or reviewed byte limits were weakened.');
}
const requiredCollectorFragments = [
  "classification: 'UNTRUSTED_DATA_ONLY'",
  'executableContentAllowed: false',
  'instructionsFromEvidenceAllowed: false',
  "'--no-ext-diff'",
  "'--no-textconv'",
  "'MANDATORY_CONTEXT_MISSING'",
  "'MANDATORY_CONTEXT_TRUNCATED'",
  "'GLOBAL_EVIDENCE_LIMIT'",
  "'PACKET_SIZE_LIMIT'",
];
for (const fragment of requiredCollectorFragments) {
  if (!collector.includes(fragment)) {
    violations.push(`Missing context collector invariant: ${fragment}`);
  }
}
if (
  collector.includes('execSync') ||
  collector.includes('shell: true') ||
  collector.includes('fetch(') ||
  collector.includes('https.request')
) {
  violations.push('Context collector must not execute repository code or access the network.');
}
const spawnedCommands = [...collector.matchAll(/spawnSync\(([^,]+)/g)].map((match) => match[1].trim());
if (spawnedCommands.length === 0 || spawnedCommands.some((command) => command !== "'git'")) {
  violations.push('Context collector may spawn only the Git executable.');
}
if (packageJson.scripts?.['context:collect'] !== 'node scripts/collect-adversarial-context.ts') {
  violations.push('Missing canonical local context collection command.');
}

if (
  packageJson.devDependencies?.['@azure/identity'] !== '4.13.1' ||
  packageJson.scripts?.['review:adversarial'] !== 'node scripts/review-adversarial-context.ts'
) {
  violations.push('Reviewer must use the pinned Azure Identity client and canonical command.');
}
if (
  reviewerConfig.version !== '1.0.0' ||
  reviewerConfig.expectedDeploymentId !== 'game-hub-unit-test-reviewer' ||
  reviewerConfig.credentialScope !== 'https://cognitiveservices.azure.com/.default' ||
  JSON.stringify(reviewerConfig.allowedEndpointSuffixes) !== JSON.stringify(['.openai.azure.com']) ||
  reviewerConfig.limits?.maxConcurrentReviews !== 3 ||
  reviewerConfig.limits?.maxOutputTokens > 8000 ||
  reviewerConfig.limits?.maxOutputBytes > 131072 ||
  reviewerConfig.limits?.maxRetries > 2 ||
  reviewerConfig.limits?.maxEstimatedCostUsd > 0.25 ||
  reviewerConfig.allowedTools?.length !== 0
) {
  violations.push('Reviewer engine identity, destination, or execution limits were weakened.');
}
const systemPolicyHash = crypto.createHash('sha256').update(systemPolicy).digest('hex');
if (systemPolicyHash !== reviewerConfig.systemPolicyContentHash) {
  violations.push('Reviewer system policy hash does not match its versioned file.');
}
const requiredReviewerFragments = [
  'new DefaultAzureCredential()',
  'Authorization: `Bearer ${token.token}`',
  '`UNTRUSTED_EVIDENCE_${evidenceHash}`',
  "role: 'system'",
  "role: 'developer'",
  "role: 'user'",
  'allowedTools: []',
  'new ReviewSemaphore',
  "'POLICY_VALIDATION_FAILED'",
  "'SCHEMA_VALIDATION_FAILED'",
  "'MISSING_OUTPUT'",
  "'MODEL_BUDGET_EXCEEDED'",
  '[408, 429, 500, 502, 503, 504]',
];
for (const fragment of requiredReviewerFragments) {
  if (!reviewerEngine.includes(fragment)) {
    violations.push(`Missing reviewer engine invariant: ${fragment}`);
  }
}
if (
  reviewerEngine.includes("'api-key'") ||
  reviewerEngine.includes('"api-key"') ||
  reviewerEngine.includes('tools: request.allowedTools')
) {
  violations.push('Reviewer transport must not use API keys or expose model tools.');
}

const requiredScenarios = [
  'tautology',
  'ineffective-mock',
  'missing-error-path',
  'race-condition',
  'duplicate-score-submission',
  'collision-boundary',
  'zip-archive-traversal',
  'authorization-bypass',
  'cleanup-leak',
];
const benchmarkIds = new Set();
if (benchmarkCorpus.version !== '1.0.0' || benchmarkCorpus.cases?.length !== 18) {
  violations.push('Calibration corpus must remain version 1.0.0 with exactly 18 reviewed cases.');
}
for (const scenario of requiredScenarios) {
  for (const strength of ['weak', 'strong']) {
    const matches =
      benchmarkCorpus.cases?.filter(
        (benchmark) => benchmark.scenario === scenario && benchmark.strength === strength,
      ) ?? [];
    if (matches.length !== 1) {
      violations.push(`Calibration corpus must contain exactly one ${strength} ${scenario} case.`);
    }
  }
}
for (const benchmark of benchmarkCorpus.cases ?? []) {
  if (
    !benchmark.id ||
    benchmarkIds.has(benchmark.id) ||
    typeof benchmark.production !== 'string' ||
    typeof benchmark.test !== 'string' ||
    benchmark.production.length === 0 ||
    benchmark.test.length === 0 ||
    (benchmark.strength === 'weak' && (!benchmark.critical || typeof benchmark.expectedCategory !== 'string')) ||
    (benchmark.strength === 'strong' && (benchmark.critical || benchmark.expectedCategory !== null))
  ) {
    violations.push(`Calibration benchmark is malformed: ${benchmark.id ?? '<missing id>'}`);
  }
  benchmarkIds.add(benchmark.id);
}

const expectedPromotionPolicy = {
  requiredRunMode: 'azure',
  minimumCases: 18,
  minimumRepetitionsPerCase: 2,
  thresholds: {
    minimumBlockingPatternDetectionRate: 1,
    maximumStrongFalsePositiveRate: 0.05,
    maximumMissedCriticalScenarios: 0,
    minimumReviewerAgreementRate: 0.95,
    maximumAverageCostUsd: 0.1,
    maximumP95LatencyMs: 60000,
    maximumErrorRate: 0,
  },
};
if (
  promotionPolicy.version !== '1.0.0' ||
  promotionPolicy.requiredRunMode !== expectedPromotionPolicy.requiredRunMode ||
  promotionPolicy.minimumCases !== expectedPromotionPolicy.minimumCases ||
  promotionPolicy.minimumRepetitionsPerCase !== expectedPromotionPolicy.minimumRepetitionsPerCase ||
  JSON.stringify(promotionPolicy.thresholds) !== JSON.stringify(expectedPromotionPolicy.thresholds)
) {
  violations.push('Calibration promotion thresholds or Azure-only requirement were weakened.');
}
const requiredInvalidationInputs = [
  'modelDeployment',
  'modelVersion',
  'promptVersion',
  'promptContentHash',
  'toolsVersion',
  'testFramework',
  'schemaVersion',
  'schemaContentHash',
  'policyVersion',
  'policyContentHash',
  'architectureContentHash',
  'systemPolicyVersion',
  'systemPolicyContentHash',
  'reviewerEngineConfigVersion',
  'reviewerEngineConfigContentHash',
  'benchmarkCorpusVersion',
  'benchmarkCorpusContentHash',
];
for (const input of requiredInvalidationInputs) {
  if (!promotionPolicy.invalidationInputs?.includes(input)) {
    violations.push(`Calibration fingerprint must invalidate on ${input}.`);
  }
}
if (
  packageJson.scripts?.['calibrate:adversarial'] !== 'node scripts/evaluate-adversarial-reviewer.ts' ||
  packageJson.scripts?.['calibration:check'] !== 'node scripts/evaluate-adversarial-reviewer.ts --mode check'
) {
  violations.push('Missing canonical calibration evaluation or promotion-check command.');
}
const requiredEvaluatorFragments = [
  'runMode !== policy.requiredRunMode',
  "'Calibration fingerprint is stale.'",
  "'Report hash is invalid.'",
  "'Reported metrics do not match case evidence.'",
  'createReviewerFromEnvironment(repoRoot)',
  'new AdversarialReviewerEngine',
  'minimumReviewerAgreementRate',
  'maximumStrongFalsePositiveRate',
  'maximumMissedCriticalScenarios',
];
for (const fragment of requiredEvaluatorFragments) {
  if (!evaluator.includes(fragment)) {
    violations.push(`Missing calibration evaluator invariant: ${fragment}`);
  }
}
if (
  workflowSources.some(
    (source) =>
      !source.startsWith('name: Adversarial review') &&
      (source.includes('review:adversarial') ||
        source.includes('calibrate:adversarial') ||
        source.includes('evaluate-adversarial-reviewer') ||
        source.includes('publish:adversarial') ||
        source.includes('publish-adversarial-evidence')),
  )
) {
  violations.push('Model-backed review and publication may run only in the reviewed downstream workflow.');
}

if (
  publisherConfig.version !== '1.0.0' ||
  publisherConfig.artifactVersion !== '1.0.0' ||
  publisherConfig.manifestVersion !== '1.0.0' ||
  publisherConfig.checkNamePrefix !== 'Adversarial Review' ||
  publisherConfig.githubApiVersion !== '2022-11-28' ||
  publisherConfig.retentionDays !== 90 ||
  publisherConfig.limits?.maxAnnotationsPerRequest !== 50 ||
  publisherConfig.limits?.maxAnnotationsTotal !== 1000 ||
  publisherConfig.limits?.maxCheckSummaryBytes !== 32768 ||
  publisherConfig.limits?.maxCheckTextBytes !== 32768
) {
  violations.push('GitHub publisher identity, retention, or annotation limits were weakened.');
}
if (packageJson.scripts?.['publish:adversarial'] !== 'node scripts/publish-adversarial-evidence.ts') {
  violations.push('Missing canonical adversarial evidence publication command.');
}
if (
  packageJson.scripts?.['exceptions:validate'] !==
    'node scripts/apply-adversarial-exceptions.ts --exceptions config/adversarial-agents/exceptions.json' ||
  packageJson.scripts?.['agents:validate'] !== 'node scripts/validate-adversarial-agent-registry.ts .'
) {
  violations.push('Missing canonical exception or independent-agent validation command.');
}
const requiredPublisherFragments = [
  'String(selectedAttribution.agentName',
  'attribution.repositoryCommit !== options.headSha',
  'summary.pullRequestCommit !== options.headSha',
  "'Multiple check runs already exist for this agent and head SHA'",
  "url.searchParams.set('filter', 'all')",
  'maxAnnotationsPerRequest',
  'findingFingerprint',
  'supersedesRunFingerprint',
  "'[REDACTED:SENSITIVE_CONTENT]'",
  'validateEvidenceManifest',
  'validatePromotionReport(repoRoot, calibrationReport)',
  'evaluateAdversarialExceptions',
  'exceptionEvaluation',
  'loadAgentRegistration(options.repoRoot, agentName)',
];
for (const fragment of requiredPublisherFragments) {
  if (!publisher.includes(fragment)) {
    violations.push(`Missing GitHub publisher invariant: ${fragment}`);
  }
}
if (verdictPolicy.properties?.notificationSettings?.properties?.commentOnFail?.const !== false) {
  violations.push('Adversarial review must publish checks without pull-request comment spam.');
}

const strictObjectSchemas = (value) => {
  if (!value || typeof value !== 'object') return [];
  const failures = [];
  if (value.type === 'object' && value.additionalProperties !== false) failures.push(value);
  for (const nested of Object.values(value)) failures.push(...strictObjectSchemas(nested));
  return failures;
};
if (
  exceptionSchema.version !== '1.0.0' ||
  strictObjectSchemas(exceptionSchema).length > 0 ||
  exceptionRegistry.version !== '1.0.0' ||
  exceptionRegistry.maximumValidityHours !== 168 ||
  exceptionRegistry.maximumExceptionsPerRun !== 3 ||
  !Array.isArray(exceptionRegistry.exceptions)
) {
  violations.push('Exception contract or protected registry limits are invalid or not strict.');
}
for (const fragment of [
  'integritySha256',
  'approvalRecordSha256',
  'runFingerprint',
  'findingFingerprint',
  'maximumValidityHours',
  'unexceptedBlockingFindingFingerprints',
  'Exception is duplicated or replayed',
]) {
  if (!exceptionEvaluator.includes(fragment)) {
    violations.push(`Missing exception fail-closed invariant: ${fragment}`);
  }
}
if (agentRegistrySchema.version !== '1.0.0' || strictObjectSchemas(agentRegistrySchema).length > 0) {
  violations.push('Independent-agent registry schema must be strict and versioned.');
}
for (const fragment of [
  'promptContentHash',
  'policyContentHash',
  'engineConfigContentHash',
  'benchmarkCorpusContentHash',
  'promotionPolicyContentHash',
  'activeCalibrationReportFile',
  'checkName',
  'stateNamespace',
  'maxConcurrentReviews',
  'must not share or impersonate',
]) {
  if (!agentRegistryValidator.includes(fragment)) {
    violations.push(`Missing independent-agent isolation invariant: ${fragment}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Adversarial policy failed:\n${violations.join('\n')}`);
}

console.log('Adversarial infrastructure, runtime, calibration, and publication policy passed.');
