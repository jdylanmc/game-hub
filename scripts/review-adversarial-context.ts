#!/usr/bin/env node

import { DefaultAzureCredential } from '@azure/identity';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdversarialFindingValidator } from './validate-adversarial-finding.ts';
import { loadAgentRegistration } from './validate-adversarial-agent-registry.ts';
import { stableStringify } from './collect-adversarial-context.ts';

const ENGINE_VERSION = '2.0.0';

type JsonObject = Record<string, unknown>;

interface ReviewerEngineConfig {
  version: string;
  apiVersion: string;
  credentialScope: string;
  expectedDeploymentId: string;
  allowedEndpointSuffixes: string[];
  systemPolicyVersion: string;
  systemPolicyFile: string;
  systemPolicyContentHash: string;
  limits: {
    maxContextBytes: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxOutputBytes: number;
    timeoutMs: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    maxConcurrentReviews: number;
    maxEstimatedCostUsd: number;
    inputUsdPerMillionTokens: number;
    outputUsdPerMillionTokens: number;
  };
  critic: {
    maxConcurrentReviews: number;
    inconclusiveBlocksAtConfidence: 'HIGH';
  };
  persona: {
    fallbackTitle: string;
  };
  allowedTools: string[];
  allowedNetworkDestinations: string[];
}

interface AgentConfig {
  name: string;
  version: string;
  promptFile: string;
  promptVersion: string;
  promptContentHash: string;
  modelDeployment: string;
  modelVersion: string;
  schemaFile: string;
  schemaContentHash: string;
  policyContentHash: string;
  toolsVersion: string;
  executionConfig: {
    maxConcurrentReviews: number;
  };
}

interface TransportMessage {
  role: 'system' | 'developer' | 'user';
  content: string;
}

interface ReviewerTransportRequest {
  endpoint: string;
  deploymentId: string;
  apiVersion: string;
  credentialScope: string;
  messages: TransportMessage[];
  responseSchema: JsonObject;
  maxOutputTokens: number;
  temperature: number;
  allowedTools: string[];
  evidenceSha256: string;
}

interface ReviewerTransportResponse {
  content?: string;
  promptTokens: number;
  completionTokens: number;
}

interface ReviewerTransport {
  complete(request: Readonly<ReviewerTransportRequest>, signal: AbortSignal): Promise<ReviewerTransportResponse>;
}

interface TokenCredential {
  getToken(scopes: string | string[], options?: { abortSignal?: AbortSignal }): Promise<{ token: string } | null>;
}

interface ReviewerClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

interface ReviewResult {
  schemaVersion: string;
  findingVersion: string;
  attribution: JsonObject;
  provenance: JsonObject;
  artifactDigest: JsonObject;
  verdict: JsonObject;
  findings: unknown[];
  summary?: JsonObject;
  presentation?: JsonObject;
}

class ReviewerTransportError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(code: string, message: string, retryable: boolean, retryAfterMs?: number) {
    super(message);
    this.name = 'ReviewerTransportError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

class ReviewSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 3) {
      throw new Error('Review concurrency must be between one and three');
    }
    this.capacity = capacity;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

const defaultClock: ReviewerClock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
  } else if (isObject(value)) {
    Object.values(value).forEach(deepFreeze);
  }
  return Object.freeze(value);
}

function isoTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function validateEndpoint(endpoint: string, deploymentId: string, config: ReviewerEngineConfig): string {
  if (!endpoint || !deploymentId) {
    throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_ID are required');
  }
  if (deploymentId !== config.expectedDeploymentId) {
    throw new Error('Azure OpenAI deployment ID does not match reviewed configuration');
  }
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/') ||
    !config.allowedEndpointSuffixes.some(
      (suffix) => url.hostname.endsWith(suffix) && url.hostname.length > suffix.length,
    )
  ) {
    throw new Error('Azure OpenAI endpoint is outside the allowed network destination');
  }
  return url.origin;
}

function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

function estimateCost(promptTokens: number, completionTokens: number, config: ReviewerEngineConfig): number {
  return (
    (promptTokens * config.limits.inputUsdPerMillionTokens +
      completionTokens * config.limits.outputUsdPerMillionTokens) /
    1_000_000
  );
}

function loadJson(filePath: string): JsonObject {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(value)) throw new Error(`${filePath} must contain a JSON object`);
  return value;
}

const citationSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'startLine', 'endLine', 'snippet'],
  properties: {
    path: { type: 'string' },
    startLine: { type: 'integer', minimum: 1 },
    endLine: { type: 'integer', minimum: 1 },
    snippet: { type: 'string' },
  },
};

const citationsSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['productionFiles', 'testFiles'],
  properties: {
    productionFiles: { type: 'array', items: citationSchema },
    testFiles: { type: 'array', items: citationSchema },
    issueRequirements: { type: 'array', items: { type: 'string' } },
  },
};

const primaryResponseSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'findings'],
  properties: {
    verdict: {
      type: 'object',
      additionalProperties: false,
      required: [
        'decision',
        'kind',
        'severity',
        'blockingFindingsCount',
        'advisoryFindingsCount',
        'policyDecisionRationale',
      ],
      properties: {
        decision: { enum: ['PASS', 'FAIL'] },
        kind: { const: 'POLICY' },
        severity: { enum: ['INFO', 'ADVISORY', 'BLOCKING'] },
        blockingFindingsCount: { type: 'integer', minimum: 0 },
        advisoryFindingsCount: { type: 'integer', minimum: 0 },
        policyDecisionRationale: { type: 'string' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'title',
          'category',
          'proposedSeverity',
          'severity',
          'confidence',
          'description',
          'citations',
          'policyRule',
          'failureScenario',
          'impact',
          'remediation',
          'verificationGuidance',
        ],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          category: { type: 'string' },
          proposedSeverity: { enum: ['BLOCKING', 'ADVISORY'] },
          severity: { enum: ['BLOCKING', 'ADVISORY'] },
          confidence: { enum: ['HIGH', 'MEDIUM', 'LOW'] },
          description: { type: 'string' },
          citations: citationsSchema,
          policyRule: { type: 'string' },
          failureScenario: { type: 'string' },
          impact: { type: 'string' },
          remediation: { type: 'array', items: { type: 'string' }, minItems: 1 },
          verificationGuidance: { type: 'string' },
        },
      },
    },
  },
};

const criticResponseSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'rationale', 'citations'],
  properties: {
    decision: { enum: ['CONFIRM', 'REJECT', 'INCONCLUSIVE'] },
    rationale: { type: 'string' },
    citations: citationsSchema,
  },
};

function loadRuntime(
  repoRoot: string,
  agentName = 'unit-test-reviewer',
  allowDisabledForCalibration = false,
): {
  engineConfig: ReviewerEngineConfig;
  agentConfig: AgentConfig;
  policyVersion: string;
  blockingFindingsMinimum: number;
  reviewerPrompt: string;
  systemPolicy: string;
} {
  const registration = loadAgentRegistration(repoRoot, agentName, { allowDisabledForCalibration });
  const engineConfig = loadJson(path.join(repoRoot, registration.engineConfigFile)) as unknown as ReviewerEngineConfig;
  const policy = loadJson(path.join(repoRoot, registration.policyFile));
  const policyProperties = isObject(policy.properties) ? policy.properties : {};
  const failThresholds = isObject(policyProperties.failThresholds) ? policyProperties.failThresholds : {};
  const failThresholdProperties = isObject(failThresholds.properties) ? failThresholds.properties : {};
  const decisionRules = isObject(policy.decisionRules) ? policy.decisionRules : {};
  const blockingThreshold =
    agentName === 'gilfoyle-security-architect'
      ? Number(decisionRules.minimumBlockingFindings)
      : isObject(failThresholdProperties.blockingFindingsMinimum)
        ? Number(failThresholdProperties.blockingFindingsMinimum.const)
        : Number.NaN;
  const agentConfig = registration as AgentConfig;
  const reviewerPrompt = fs.readFileSync(path.join(repoRoot, agentConfig.promptFile), 'utf8');
  const systemPolicy = fs.readFileSync(path.join(repoRoot, engineConfig.systemPolicyFile), 'utf8');
  if (sha256(reviewerPrompt) !== agentConfig.promptContentHash) {
    throw new Error('Reviewer prompt hash does not match the registered prompt');
  }
  if (
    sha256(systemPolicy) !== engineConfig.systemPolicyContentHash ||
    engineConfig.version !== ENGINE_VERSION ||
    engineConfig.systemPolicyVersion !== '1.0.0' ||
    engineConfig.allowedTools.length !== 0 ||
    engineConfig.limits.maxConcurrentReviews > 3 ||
    engineConfig.limits.maxConcurrentReviews !== agentConfig.executionConfig.maxConcurrentReviews ||
    !Number.isInteger(blockingThreshold) ||
    blockingThreshold < 1
  ) {
    throw new Error('Reviewer engine configuration violates the reviewed policy');
  }
  return {
    engineConfig,
    agentConfig,
    policyVersion: String(policy.version),
    blockingFindingsMinimum: blockingThreshold,
    reviewerPrompt,
    systemPolicy,
  };
}

function packetIdentity(packet: unknown): {
  repository: string;
  headSha: string;
  baseSha: string;
  pullRequestNumber: number;
  sourceIssueNumber: number;
  workflowRunId: number;
  workflowRunAttempt: number;
  contextStatus: string;
} {
  if (!isObject(packet) || !isObject(packet.attribution)) {
    throw new Error('Context packet attribution is missing');
  }
  const headSha = packet.attribution.headSha;
  const baseSha = packet.attribution.baseSha;
  const pullRequestNumber = packet.attribution.pullRequestNumber;
  const sourceIssueNumber = packet.attribution.issueNumber;
  const workflowRunId = packet.attribution.workflowRunId;
  const workflowRunAttempt = packet.attribution.workflowRunAttempt;
  const repository = packet.attribution.repository;
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    typeof headSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(headSha) ||
    typeof baseSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(baseSha) ||
    !Number.isInteger(pullRequestNumber) ||
    !Number.isInteger(sourceIssueNumber) ||
    !Number.isInteger(workflowRunId) ||
    !Number.isInteger(workflowRunAttempt)
  ) {
    throw new Error('Context packet identity is invalid');
  }
  return {
    repository,
    headSha,
    baseSha,
    pullRequestNumber: Number(pullRequestNumber),
    sourceIssueNumber: Number(sourceIssueNumber),
    workflowRunId: Number(workflowRunId),
    workflowRunAttempt: Number(workflowRunAttempt),
    contextStatus: String(packet.status),
  };
}

function configurationFingerprint(agent: AgentConfig, policyVersion: string): string {
  return sha256(
    stableStringify({
      agentName: agent.name,
      agentVersion: agent.version,
      schemaContentHash: agent.schemaContentHash,
      policyContentHash: agent.policyContentHash,
      policyVersion,
    }),
  );
}

function runtimeAttribution(
  agent: AgentConfig,
  policyVersion: string,
  headSha: string,
  timestamp: string,
  contextFingerprint: string,
): JsonObject {
  return {
    agentName: agent.name,
    agentVersion: agent.version,
    modelDeployment: agent.modelDeployment,
    modelVersion: agent.modelVersion,
    promptVersion: agent.promptVersion,
    promptContentHash: agent.promptContentHash,
    schemaVersion: '2.0.0',
    schemaContentHash: agent.schemaContentHash,
    policyVersion,
    policyContentHash: agent.policyContentHash,
    toolsVersion: agent.toolsVersion,
    subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
    repositoryCommit: headSha,
    contextFingerprint,
    calibrationFingerprint: configurationFingerprint(agent, policyVersion),
    timestamp,
  };
}

function platformFailure(options: {
  agent: AgentConfig;
  policyVersion: string;
  identity: {
    repository: string;
    headSha: string;
    baseSha: string;
    pullRequestNumber: number;
    sourceIssueNumber: number;
    workflowRunId: number;
    workflowRunAttempt: number;
  };
  timestamp: string;
  code: string;
  message: string;
  contextSha256?: string;
}): ReviewResult {
  const contextSha256 = options.contextSha256 ?? '0'.repeat(64);
  return {
    schemaVersion: '2.0.0',
    findingVersion: `${options.agent.name}@${options.timestamp}`,
    attribution: runtimeAttribution(
      options.agent,
      options.policyVersion,
      options.identity.headSha,
      options.timestamp,
      contextSha256,
    ),
    provenance: {
      repository: options.identity.repository,
      pullRequestNumber: options.identity.pullRequestNumber,
      sourceIssueNumber: options.identity.sourceIssueNumber,
      baseCommit: options.identity.baseSha,
      headCommit: options.identity.headSha,
      workflowRunId: options.identity.workflowRunId,
      workflowRunAttempt: options.identity.workflowRunAttempt,
      contextSha256,
      configurationFingerprint: configurationFingerprint(options.agent, options.policyVersion),
    },
    artifactDigest: { algorithm: 'sha256', value: contextSha256 },
    verdict: {
      decision: 'FAIL',
      kind: 'PLATFORM',
      severity: 'ERROR',
      blockingFindingsCount: 0,
      advisoryFindingsCount: 0,
      platformError: { code: options.code, message: options.message },
      policyDecisionRationale: 'Review failed closed before a policy-safe verdict was available.',
    },
    findings: [],
  };
}

function computeInconclusive(
  options: Parameters<typeof platformFailure>[0] & { retryDelaysMs: number[] },
): ReviewResult {
  return {
    ...platformFailure(options),
    verdict: {
      decision: 'INCONCLUSIVE',
      kind: 'COMPUTE',
      severity: 'INCONCLUSIVE',
      blockingFindingsCount: 0,
      advisoryFindingsCount: 0,
      compute: {
        code: options.code,
        message: options.message,
        attempts: 3,
        retryDelaysMs: options.retryDelaysMs,
      },
      policyDecisionRationale:
        'The reviewed artificial-intelligence compute remained unavailable after bounded retries.',
    },
  };
}

function findingFingerprint(value: unknown): string {
  if (!isObject(value)) return sha256(stableStringify(value));
  const finding = Object.fromEntries(Object.entries(value).filter(([property]) => property !== 'id'));
  return sha256(stableStringify(finding));
}

function deduplicateFindings(findings: unknown[]): unknown[] {
  const sorted = findings
    .map((finding) => ({ finding, fingerprint: findingFingerprint(finding) }))
    .sort((left, right) => {
      const fingerprintOrder = left.fingerprint.localeCompare(right.fingerprint);
      if (fingerprintOrder !== 0) return fingerprintOrder;
      const leftId = isObject(left.finding) ? String(left.finding.id ?? '') : '';
      const rightId = isObject(right.finding) ? String(right.finding.id ?? '') : '';
      return leftId.localeCompare(rightId);
    });
  const seen = new Set<string>();
  return sorted
    .filter(({ fingerprint }) => {
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    })
    .map(({ finding }) => finding);
}

function withProvisionalCritics(findings: unknown[]): unknown[] {
  return findings.map((finding) => {
    if (!isObject(finding) || finding.proposedSeverity !== 'BLOCKING' || finding.critic !== undefined) {
      return finding;
    }
    return {
      ...finding,
      critic: {
        decision: 'CONFIRM',
        rationale: 'Pending separate critic validation.',
        citations: finding.citations,
      },
    };
  });
}

function deriveVerdict(findings: unknown[], blockingFindingsMinimum: number, agentName: string): JsonObject {
  const blockingCount = findings.filter(
    (finding) =>
      isObject(finding) &&
      finding.severity === 'BLOCKING' &&
      (agentName === 'gilfoyle-security-architect' || finding.confidence === 'HIGH'),
  ).length;
  const advisoryCount = findings.length - blockingCount;
  return {
    decision: blockingCount >= blockingFindingsMinimum ? 'FAIL' : 'PASS',
    kind: 'POLICY',
    severity:
      blockingCount >= blockingFindingsMinimum
        ? 'BLOCKING'
        : advisoryCount > 0 || blockingCount > 0
          ? 'ADVISORY'
          : 'INFO',
    blockingFindingsCount: blockingCount,
    advisoryFindingsCount: advisoryCount,
    policyDecisionRationale:
      blockingCount >= blockingFindingsMinimum
        ? `${blockingCount} validated high-confidence blocking finding(s) meet the policy threshold of ${blockingFindingsMinimum}.`
        : 'No validated high-confidence blocking findings meet the policy threshold.',
  };
}

class AzureOpenAITransport implements ReviewerTransport {
  private readonly credential: TokenCredential;
  private readonly fetchImplementation: typeof fetch;

  constructor(credential: TokenCredential, fetchImplementation: typeof fetch = fetch) {
    this.credential = credential;
    this.fetchImplementation = fetchImplementation;
  }

  async complete(request: Readonly<ReviewerTransportRequest>, signal: AbortSignal): Promise<ReviewerTransportResponse> {
    let token;
    try {
      token = await this.credential.getToken(request.credentialScope, { abortSignal: signal });
    } catch (error) {
      if (signal.aborted) {
        throw new ReviewerTransportError('TIMEOUT', 'Token acquisition timed out', false);
      }
      throw new ReviewerTransportError(
        'IDENTITY_FAILURE',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
    if (!token?.token) {
      throw new ReviewerTransportError('IDENTITY_FAILURE', 'Microsoft Entra ID returned no access token', false);
    }

    const url = `${request.endpoint}/openai/deployments/${encodeURIComponent(
      request.deploymentId,
    )}/chat/completions?api-version=${encodeURIComponent(request.apiVersion)}`;
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: request.messages,
          max_completion_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          response_format: {
            type: 'json_object',
          },
        }),
      });
    } catch (error) {
      if (signal.aborted) {
        throw new ReviewerTransportError('TIMEOUT', 'Model request timed out', false);
      }
      throw new ReviewerTransportError('NETWORK_FAILURE', error instanceof Error ? error.message : String(error), true);
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      if (signal.aborted) {
        throw new ReviewerTransportError('TIMEOUT', 'Model response timed out', false);
      }
      throw new ReviewerTransportError('NETWORK_FAILURE', error instanceof Error ? error.message : String(error), true);
    }
    if (!response.ok) {
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Math.max(0, Number(retryAfterHeader) * 1000) : undefined;
      throw new ReviewerTransportError(
        `MODEL_HTTP_${response.status}`,
        responseText.slice(0, 1000) || response.statusText,
        retryable,
        retryAfterMs,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new ReviewerTransportError(
        'MODEL_RESPONSE_INVALID',
        'Azure OpenAI returned malformed response JSON',
        false,
      );
    }
    if (!isObject(payload)) {
      throw new ReviewerTransportError(
        'MODEL_RESPONSE_INVALID',
        'Azure OpenAI returned an invalid response object',
        false,
      );
    }
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = isObject(choices[0]) ? choices[0] : undefined;
    const message = firstChoice && isObject(firstChoice.message) ? firstChoice.message : undefined;
    const usage = isObject(payload.usage) ? payload.usage : {};
    return {
      content: typeof message?.content === 'string' ? message.content : undefined,
      promptTokens: Number(usage.prompt_tokens ?? 0),
      completionTokens: Number(usage.completion_tokens ?? 0),
    };
  }
}

class AdversarialReviewerEngine {
  private readonly validator: AdversarialFindingValidator;
  private readonly semaphore: ReviewSemaphore;
  private readonly options: {
    repoRoot: string;
    endpoint: string;
    deploymentId: string;
    transport: ReviewerTransport;
    criticTransport?: ReviewerTransport;
    personaRenderer?: (result: Readonly<ReviewResult>) => Promise<string>;
    clock?: ReviewerClock;
    semaphore?: ReviewSemaphore;
    limitsOverride?: Partial<ReviewerEngineConfig['limits']>;
    agentName?: string;
    calibrationMode?: boolean;
  };

  constructor(options: {
    repoRoot: string;
    endpoint: string;
    deploymentId: string;
    transport: ReviewerTransport;
    criticTransport?: ReviewerTransport;
    personaRenderer?: (result: Readonly<ReviewResult>) => Promise<string>;
    clock?: ReviewerClock;
    semaphore?: ReviewSemaphore;
    limitsOverride?: Partial<ReviewerEngineConfig['limits']>;
    agentName?: string;
    calibrationMode?: boolean;
  }) {
    this.options = options;
    const agentName = options.agentName ?? 'unit-test-reviewer';
    this.validator = new AdversarialFindingValidator(options.repoRoot, agentName, options.calibrationMode === true);
    const runtime = loadRuntime(options.repoRoot, agentName, options.calibrationMode === true);
    if (options.limitsOverride) {
      for (const [key, value] of Object.entries(options.limitsOverride)) {
        if (
          typeof value !== 'number' ||
          value < 0 ||
          value > runtime.engineConfig.limits[key as keyof ReviewerEngineConfig['limits']]
        ) {
          throw new Error(`Test/runtime limit override may only reduce ${key}`);
        }
      }
    }
    validateEndpoint(options.endpoint, options.deploymentId, runtime.engineConfig);
    this.semaphore =
      options.semaphore ??
      new ReviewSemaphore(
        options.limitsOverride?.maxConcurrentReviews ?? runtime.engineConfig.limits.maxConcurrentReviews,
      );
  }

  async review(packet: unknown): Promise<ReviewResult> {
    return this.semaphore.run(() => this.reviewWithPermit(packet));
  }

  private async applyCritics(
    findings: unknown[],
    request: Readonly<ReviewerTransportRequest>,
    clock: ReviewerClock,
  ): Promise<unknown[]> {
    const transport = this.options.criticTransport ?? this.options.transport;
    const reviewed: unknown[] = [];
    for (const finding of findings) {
      if (!isObject(finding) || finding.proposedSeverity !== 'BLOCKING') {
        reviewed.push(finding);
        continue;
      }
      const criticRequest = deepFreeze<ReviewerTransportRequest>({
        ...request,
        responseSchema: criticResponseSchema,
        messages: [
          request.messages[0],
          {
            role: 'developer',
            content:
              'Critic review: return only JSON with decision CONFIRM, REJECT, or INCONCLUSIVE, a cited rationale, and citations. Do not change the primary finding.',
          },
          { role: 'user', content: stableStringify(finding) },
        ],
      });
      let critic: JsonObject | undefined;
      const delays: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await transport.complete(criticRequest, new AbortController().signal);
          const parsed: unknown = JSON.parse(response.content ?? '');
          if (!isObject(parsed)) throw new Error('Critic output was not a JSON object');
          critic = parsed;
          break;
        } catch (error) {
          if (error instanceof ReviewerTransportError && error.retryable && attempt < 2) {
            const delay = error.retryAfterMs ?? 250 * 2 ** attempt;
            delays.push(delay);
            await clock.sleep(delay);
            continue;
          }
          if (error instanceof ReviewerTransportError && error.retryable) {
            critic = {
              decision: 'INCONCLUSIVE',
              rationale: `Critic compute was unavailable after three attempts: ${error.code}.`,
              citations: finding.citations,
            };
            break;
          }
          throw new Error(`CRITIC_FAILURE: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (
        !critic ||
        !['CONFIRM', 'REJECT', 'INCONCLUSIVE'].includes(String(critic.decision)) ||
        typeof critic.rationale !== 'string' ||
        !isObject(critic.citations)
      ) {
        throw new Error('CRITIC_OUTPUT_INVALID');
      }
      const severity =
        critic.decision === 'CONFIRM' || (critic.decision === 'INCONCLUSIVE' && finding.confidence === 'HIGH')
          ? 'BLOCKING'
          : 'ADVISORY';
      reviewed.push({ ...finding, critic, severity });
    }
    return reviewed;
  }

  private async addPresentation(result: ReviewResult, fallbackTitle: string): Promise<ReviewResult> {
    const neutral = (): JsonObject => ({
      title: fallbackTitle,
      summary: `Authoritative decision: ${String(result.verdict.decision)}.`,
      mode: 'NEUTRAL_FALLBACK',
    });
    try {
      if (!this.options.personaRenderer) return { ...result, presentation: neutral() };
      const rendered = await this.options.personaRenderer(Object.freeze(structuredClone(result)));
      if (!rendered.trim()) throw new Error('Persona renderer returned empty output');
      return {
        ...result,
        presentation: {
          title: fallbackTitle,
          summary: rendered,
          mode: 'PERSONA',
        },
      };
    } catch {
      return { ...result, presentation: neutral() };
    }
  }

  private async reviewWithPermit(packet: unknown): Promise<ReviewResult> {
    const runtime = loadRuntime(this.options.repoRoot, this.options.agentName, this.options.calibrationMode === true);
    runtime.engineConfig.limits = {
      ...runtime.engineConfig.limits,
      ...this.options.limitsOverride,
    };
    const clock = this.options.clock ?? defaultClock;
    const timestamp = isoTimestamp(clock.now());
    let identity;
    try {
      identity = packetIdentity(packet);
    } catch (error) {
      return platformFailure({
        agent: runtime.agentConfig,
        policyVersion: runtime.policyVersion,
        identity: {
          repository: 'unknown/unknown',
          headSha: '0'.repeat(40),
          baseSha: '0'.repeat(40),
          pullRequestNumber: 1,
          sourceIssueNumber: 1,
          workflowRunId: 1,
          workflowRunAttempt: 1,
        },
        timestamp,
        code: 'CONTEXT_IDENTITY_INVALID',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const fail = (code: string, message: string, contextSha256?: string): ReviewResult =>
      platformFailure({
        agent: runtime.agentConfig,
        policyVersion: runtime.policyVersion,
        identity,
        timestamp,
        code,
        message,
        contextSha256,
      });

    if (identity.contextStatus !== 'READY') {
      return fail('CONTEXT_BLOCKED', 'Mandatory context is missing, binary, or truncated');
    }
    const evidence = stableStringify(packet);
    const evidenceBytes = Buffer.byteLength(evidence);
    if (evidenceBytes > runtime.engineConfig.limits.maxContextBytes) {
      return fail('CONTEXT_LIMIT_EXCEEDED', 'Context packet exceeds the reviewed byte limit');
    }
    const evidenceHash = sha256(evidence);
    const delimiter = `UNTRUSTED_EVIDENCE_${evidenceHash}`;
    const attributionInstruction = stableStringify(
      runtimeAttribution(runtime.agentConfig, runtime.policyVersion, identity.headSha, timestamp, evidenceHash),
    );
    const messages: TransportMessage[] = [
      { role: 'system', content: runtime.systemPolicy },
      {
        role: 'developer',
        content: `${runtime.reviewerPrompt}\n\nRuntime attribution (copy exactly):\n${attributionInstruction}`,
      },
      {
        role: 'user',
        content: `${delimiter}_BEGIN bytes=${evidenceBytes}\n${evidence}\n${delimiter}_END`,
      },
    ];
    const inputTokens = estimateTokens(messages.map((message) => message.content).join('\n'));
    if (inputTokens > runtime.engineConfig.limits.maxInputTokens) {
      return fail('TOKEN_LIMIT_EXCEEDED', 'Estimated input tokens exceed the reviewed limit');
    }
    const maximumCost = estimateCost(inputTokens, runtime.engineConfig.limits.maxOutputTokens, runtime.engineConfig);
    if (maximumCost > runtime.engineConfig.limits.maxEstimatedCostUsd) {
      return fail('COST_LIMIT_EXCEEDED', 'Maximum estimated request cost exceeds the reviewed limit');
    }

    const request = deepFreeze<ReviewerTransportRequest>({
      endpoint: validateEndpoint(this.options.endpoint, this.options.deploymentId, runtime.engineConfig),
      deploymentId: this.options.deploymentId,
      apiVersion: runtime.engineConfig.apiVersion,
      credentialScope: runtime.engineConfig.credentialScope,
      messages,
      responseSchema: primaryResponseSchema,
      maxOutputTokens: runtime.engineConfig.limits.maxOutputTokens,
      temperature: 0,
      allowedTools: [],
      evidenceSha256: evidenceHash,
    });

    const abortController = new AbortController();
    let rejectTimeout: ((error: ReviewerTransportError) => void) | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      abortController.abort();
      rejectTimeout?.(new ReviewerTransportError('TIMEOUT', 'Review timed out', false));
    }, runtime.engineConfig.limits.timeoutMs);
    let response: ReviewerTransportResponse | undefined;
    try {
      for (let attempt = 0; attempt <= runtime.engineConfig.limits.maxRetries; attempt += 1) {
        try {
          response = await Promise.race([
            this.options.transport.complete(request, abortController.signal),
            timeoutPromise,
          ]);
          break;
        } catch (error) {
          const transportError =
            error instanceof ReviewerTransportError
              ? error
              : new ReviewerTransportError(
                  'MODEL_FAILURE',
                  error instanceof Error ? error.message : String(error),
                  false,
                );
          if (
            abortController.signal.aborted ||
            !transportError.retryable ||
            attempt === runtime.engineConfig.limits.maxRetries
          ) {
            if (
              !abortController.signal.aborted &&
              transportError.retryable &&
              attempt === runtime.engineConfig.limits.maxRetries
            ) {
              return computeInconclusive({
                agent: runtime.agentConfig,
                policyVersion: runtime.policyVersion,
                identity,
                timestamp,
                code: transportError.code,
                message: transportError.message,
                contextSha256: evidenceHash,
                retryDelaysMs: Array.from(
                  { length: runtime.engineConfig.limits.maxRetries },
                  (_, retry) => runtime.engineConfig.limits.retryBaseDelayMs * 2 ** retry,
                ),
              });
            }
            return fail(abortController.signal.aborted ? 'TIMEOUT' : transportError.code, transportError.message);
          }
          const delay = transportError.retryAfterMs ?? runtime.engineConfig.limits.retryBaseDelayMs * 2 ** attempt;
          await clock.sleep(delay);
          if (abortController.signal.aborted) {
            return fail('TIMEOUT', 'Review timed out while waiting to retry');
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!response?.content?.trim()) {
      return fail('MISSING_OUTPUT', 'Model returned no structured review output');
    }
    if (Buffer.byteLength(response.content) > runtime.engineConfig.limits.maxOutputBytes) {
      return fail('OUTPUT_LIMIT_EXCEEDED', 'Model output exceeds the reviewed byte limit');
    }
    if (
      !Number.isInteger(response.promptTokens) ||
      !Number.isInteger(response.completionTokens) ||
      response.promptTokens < 0 ||
      response.completionTokens < 1
    ) {
      return fail('MISSING_USAGE', 'Model response is missing valid token usage');
    }
    const actualCost = estimateCost(response.promptTokens, response.completionTokens, runtime.engineConfig);
    if (
      response.completionTokens > runtime.engineConfig.limits.maxOutputTokens ||
      actualCost > runtime.engineConfig.limits.maxEstimatedCostUsd
    ) {
      return fail('MODEL_BUDGET_EXCEEDED', 'Model usage exceeded reviewed token or cost limits');
    }

    let modelResult: unknown;
    try {
      modelResult = JSON.parse(response.content);
    } catch {
      return fail('INVALID_JSON', 'Model output is not valid JSON');
    }
    if (!isObject(modelResult)) {
      return fail('SCHEMA_VALIDATION_FAILED', 'Model output is not a JSON object');
    }
    const candidate = {
      ...modelResult,
      findings: withProvisionalCritics(Array.isArray(modelResult.findings) ? modelResult.findings : []),
      schemaVersion: '2.0.0',
      findingVersion: `${runtime.agentConfig.name}@${timestamp}`,
      attribution: runtimeAttribution(
        runtime.agentConfig,
        runtime.policyVersion,
        identity.headSha,
        timestamp,
        evidenceHash,
      ),
      provenance: {
        repository: identity.repository,
        pullRequestNumber: identity.pullRequestNumber,
        sourceIssueNumber: identity.sourceIssueNumber,
        baseCommit: identity.baseSha,
        headCommit: identity.headSha,
        workflowRunId: identity.workflowRunId,
        workflowRunAttempt: identity.workflowRunAttempt,
        contextSha256: evidenceHash,
        configurationFingerprint: configurationFingerprint(runtime.agentConfig, runtime.policyVersion),
      },
      artifactDigest: { algorithm: 'sha256', value: evidenceHash },
    };
    const candidateValidation = this.validator.validate(candidate);
    if (!candidateValidation.valid) {
      const policyFailure = candidateValidation.errors.every((error) => error.code === 3);
      return fail(
        policyFailure ? 'POLICY_VALIDATION_FAILED' : 'SCHEMA_VALIDATION_FAILED',
        candidateValidation.errors.map((error) => `${error.field}: ${error.message}`).join('; '),
      );
    }
    if (isObject(candidate.verdict) && candidate.verdict.decision === 'ERROR') {
      return fail(
        'MODEL_REPORTED_ERROR',
        typeof candidate.verdict.errorMessage === 'string'
          ? candidate.verdict.errorMessage
          : 'Model reported an unspecified review error',
      );
    }

    let findings: unknown[];
    try {
      findings = await this.applyCritics(
        deduplicateFindings(Array.isArray(candidate.findings) ? candidate.findings : []),
        request,
        clock,
      );
    } catch (error) {
      return fail('CRITIC_EXECUTION_FAILED', error instanceof Error ? error.message : String(error), evidenceHash);
    }
    const finalResult: ReviewResult = {
      schemaVersion: '2.0.0',
      findingVersion: `${runtime.agentConfig.name}@${timestamp}`,
      attribution: runtimeAttribution(
        runtime.agentConfig,
        runtime.policyVersion,
        identity.headSha,
        timestamp,
        evidenceHash,
      ),
      provenance: candidate.provenance,
      artifactDigest: candidate.artifactDigest,
      verdict: deriveVerdict(findings, runtime.blockingFindingsMinimum, runtime.agentConfig.name),
      findings,
      summary: {
        pullRequestNumber: identity.pullRequestNumber,
        pullRequestCommit: identity.headSha,
        tokensUsed: response.promptTokens + response.completionTokens,
        estimatedCost: Number(actualCost.toFixed(6)),
        contextCollectionStatus: 'complete',
        contextLimitations: [],
      },
    };
    const withPresentation = await this.addPresentation(finalResult, runtime.engineConfig.persona.fallbackTitle);
    const finalValidation = this.validator.validate(withPresentation);
    if (!finalValidation.valid) {
      return fail(
        'POLICY_DERIVATION_FAILED',
        finalValidation.errors.map((error) => `${error.field}: ${error.message}`).join('; '),
      );
    }
    return withPresentation;
  }
}

function createReviewerFromEnvironment(
  repoRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): AdversarialReviewerEngine {
  if (environment.AZURE_OPENAI_API_KEY || environment.OPENAI_API_KEY) {
    throw new Error('API key environment variables are forbidden; use Microsoft Entra ID');
  }
  const agentName = environment.ADVERSARIAL_AGENT_NAME ?? 'unit-test-reviewer';
  const calibrationMode = environment.ADVERSARIAL_CALIBRATION_MODE === 'true';
  const runtime = loadRuntime(repoRoot, agentName, calibrationMode);
  const endpoint = validateEndpoint(
    environment.AZURE_OPENAI_ENDPOINT ?? '',
    environment.AZURE_OPENAI_DEPLOYMENT_ID ?? '',
    runtime.engineConfig,
  );
  const credential = new DefaultAzureCredential();
  return new AdversarialReviewerEngine({
    repoRoot,
    endpoint,
    deploymentId: environment.AZURE_OPENAI_DEPLOYMENT_ID ?? '',
    agentName,
    calibrationMode,
    transport: new AzureOpenAITransport(credential),
  });
}

function parseArguments(args: string[]): { inputPath: string; outputPath?: string } {
  let inputPath = '';
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--input') inputPath = args[++index] ?? '';
    else if (args[index] === '--output') outputPath = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!inputPath) throw new Error('--input is required');
  return { inputPath, outputPath };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const packet: unknown = JSON.parse(fs.readFileSync(path.resolve(repoRoot, args.inputPath), 'utf8'));
  const result = await createReviewerFromEnvironment(repoRoot).review(packet);
  const serialized = `${stableStringify(result, 2)}\n`;
  if (args.outputPath) {
    const outputPath = path.resolve(repoRoot, args.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  } else {
    process.stdout.write(serialized);
  }
  const decision = result.verdict.decision;
  process.exitCode = decision === 'PASS' ? 0 : decision === 'FAIL' ? 2 : 3;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  AdversarialReviewerEngine,
  AzureOpenAITransport,
  ReviewSemaphore,
  ReviewerTransportError,
  createReviewerFromEnvironment,
  estimateCost,
  validateEndpoint,
};
export type { ReviewerClock, ReviewerTransport, ReviewerTransportRequest, ReviewerTransportResponse, ReviewResult };
