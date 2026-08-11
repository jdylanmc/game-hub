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

if (violations.length > 0) {
  throw new Error(`Adversarial policy failed:\n${violations.join('\n')}`);
}

console.log('Adversarial infrastructure and runtime policy passed.');
