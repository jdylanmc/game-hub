#!/usr/bin/env node

import { DefaultAzureCredential } from '@azure/identity';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdversarialFindingValidator } from './validate-adversarial-finding.ts';
import { stableStringify } from './collect-adversarial-context.ts';

const ENGINE_VERSION = '1.0.0';

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
  toolsVersion: string;
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
  verdict: JsonObject;
  findings: unknown[];
  summary?: JsonObject;
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

function loadRuntime(repoRoot: string): {
  engineConfig: ReviewerEngineConfig;
  agentConfig: AgentConfig;
  responseSchema: JsonObject;
  policyVersion: string;
  blockingFindingsMinimum: number;
  reviewerPrompt: string;
  systemPolicy: string;
} {
  const engineConfig = loadJson(
    path.join(repoRoot, 'config/adversarial-agents/reviewer-engine.json'),
  ) as unknown as ReviewerEngineConfig;
  const registry = loadJson(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'));
  const policy = loadJson(path.join(repoRoot, 'config/adversarial-agents/policy.json'));
  const responseSchema = loadJson(path.join(repoRoot, 'config/adversarial-agents/schema.json'));
  const policyProperties = isObject(policy.properties) ? policy.properties : {};
  const failThresholds = isObject(policyProperties.failThresholds) ? policyProperties.failThresholds : {};
  const failThresholdProperties = isObject(failThresholds.properties) ? failThresholds.properties : {};
  const blockingThreshold = isObject(failThresholdProperties.blockingFindingsMinimum)
    ? Number(failThresholdProperties.blockingFindingsMinimum.const)
    : Number.NaN;
  const agents = Array.isArray(registry.agents) ? registry.agents : [];
  const agent = agents.find(
    (candidate): candidate is JsonObject => isObject(candidate) && candidate.name === 'unit-test-reviewer',
  );
  if (!agent) throw new Error('unit-test-reviewer is not registered');
  const agentConfig = agent as unknown as AgentConfig;
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
    !Number.isInteger(blockingThreshold) ||
    blockingThreshold < 1
  ) {
    throw new Error('Reviewer engine configuration violates the reviewed policy');
  }
  return {
    engineConfig,
    agentConfig,
    responseSchema,
    policyVersion: String(policy.version),
    blockingFindingsMinimum: blockingThreshold,
    reviewerPrompt,
    systemPolicy,
  };
}

function packetIdentity(packet: unknown): {
  headSha: string;
  pullRequestNumber: number;
  contextStatus: string;
} {
  if (!isObject(packet) || !isObject(packet.attribution)) {
    throw new Error('Context packet attribution is missing');
  }
  const headSha = packet.attribution.headSha;
  const pullRequestNumber = packet.attribution.pullRequestNumber;
  if (typeof headSha !== 'string' || !/^[a-f0-9]{40}$/.test(headSha) || !Number.isInteger(pullRequestNumber)) {
    throw new Error('Context packet identity is invalid');
  }
  return {
    headSha,
    pullRequestNumber: Number(pullRequestNumber),
    contextStatus: String(packet.status),
  };
}

function runtimeAttribution(agent: AgentConfig, policyVersion: string, headSha: string, timestamp: string): JsonObject {
  return {
    agentName: agent.name,
    agentVersion: agent.version,
    modelDeployment: agent.modelDeployment,
    promptVersion: agent.promptVersion,
    promptContentHash: agent.promptContentHash,
    policyVersion,
    toolsVersion: agent.toolsVersion,
    subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
    repositoryCommit: headSha,
    timestamp,
  };
}

function errorResult(options: {
  agent: AgentConfig;
  policyVersion: string;
  headSha: string;
  timestamp: string;
  code: string;
  message: string;
}): ReviewResult {
  return {
    schemaVersion: '1.0.0',
    findingVersion: `${options.agent.name}@${options.timestamp}`,
    attribution: runtimeAttribution(options.agent, options.policyVersion, options.headSha, options.timestamp),
    verdict: {
      decision: 'ERROR',
      severity: 'ERROR',
      blockingFindingsCount: 0,
      advisoryFindingsCount: 0,
      errorMessage: `${options.code}: ${options.message}`,
      policyDecisionRationale: 'Review failed closed before a policy-safe verdict was available.',
    },
    findings: [],
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

function deriveVerdict(findings: unknown[], blockingFindingsMinimum: number): JsonObject {
  const blockingCount = findings.filter(
    (finding) => isObject(finding) && finding.severity === 'BLOCKING' && finding.confidence === 'HIGH',
  ).length;
  const advisoryCount = findings.length - blockingCount;
  return {
    decision: blockingCount >= blockingFindingsMinimum ? 'FAIL' : 'PASS',
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
    clock?: ReviewerClock;
    semaphore?: ReviewSemaphore;
    limitsOverride?: Partial<ReviewerEngineConfig['limits']>;
  };

  constructor(options: {
    repoRoot: string;
    endpoint: string;
    deploymentId: string;
    transport: ReviewerTransport;
    clock?: ReviewerClock;
    semaphore?: ReviewSemaphore;
    limitsOverride?: Partial<ReviewerEngineConfig['limits']>;
  }) {
    this.options = options;
    this.validator = new AdversarialFindingValidator(options.repoRoot);
    const runtime = loadRuntime(options.repoRoot);
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

  private async reviewWithPermit(packet: unknown): Promise<ReviewResult> {
    const runtime = loadRuntime(this.options.repoRoot);
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
      return errorResult({
        agent: runtime.agentConfig,
        policyVersion: runtime.policyVersion,
        headSha: '0'.repeat(40),
        timestamp,
        code: 'CONTEXT_IDENTITY_INVALID',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const fail = (code: string, message: string): ReviewResult =>
      errorResult({
        agent: runtime.agentConfig,
        policyVersion: runtime.policyVersion,
        headSha: identity.headSha,
        timestamp,
        code,
        message,
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
      runtimeAttribution(runtime.agentConfig, runtime.policyVersion, identity.headSha, timestamp),
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
      responseSchema: runtime.responseSchema,
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
      schemaVersion: '1.0.0',
      findingVersion: `${runtime.agentConfig.name}@${timestamp}`,
      attribution: runtimeAttribution(runtime.agentConfig, runtime.policyVersion, identity.headSha, timestamp),
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

    const findings = deduplicateFindings(Array.isArray(candidate.findings) ? candidate.findings : []);
    const finalResult: ReviewResult = {
      schemaVersion: '1.0.0',
      findingVersion: `${runtime.agentConfig.name}@${timestamp}`,
      attribution: runtimeAttribution(runtime.agentConfig, runtime.policyVersion, identity.headSha, timestamp),
      verdict: deriveVerdict(findings, runtime.blockingFindingsMinimum),
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
    const finalValidation = this.validator.validate(finalResult);
    if (!finalValidation.valid) {
      return fail(
        'POLICY_DERIVATION_FAILED',
        finalValidation.errors.map((error) => `${error.field}: ${error.message}`).join('; '),
      );
    }
    return finalResult;
  }
}

function createReviewerFromEnvironment(
  repoRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): AdversarialReviewerEngine {
  if (environment.AZURE_OPENAI_API_KEY || environment.OPENAI_API_KEY) {
    throw new Error('API key environment variables are forbidden; use Microsoft Entra ID');
  }
  const runtime = loadRuntime(repoRoot);
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
