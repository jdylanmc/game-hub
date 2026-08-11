import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(root, '.github/workflows/deploy-adversarial-infrastructure.yml'), 'utf8');
const bicep = await fs.readFile(path.join(root, 'infra/bicep/resources.bicep'), 'utf8');
const mainBicep = await fs.readFile(path.join(root, 'infra/bicep/main.bicep'), 'utf8');
const agentConfig = JSON.parse(
  await fs.readFile(path.join(root, 'config/adversarial-agents/agents-config.json'), 'utf8'),
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

if (violations.length > 0) {
  throw new Error(`Adversarial policy failed:\n${violations.join('\n')}`);
}

console.log('Adversarial infrastructure and runtime policy passed.');
