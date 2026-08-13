#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdversarialReviewerEngine, createReviewerFromEnvironment } from './review-adversarial-context.ts';
import { stableStringify } from './collect-adversarial-context.ts';
import { expectedReportFingerprintComponents } from './calibration-attestation.ts';
import { loadAgentRegistration } from './validate-adversarial-agent-registry.ts';

const REPORT_SCHEMA_VERSION = '1.0.0';

type JsonObject = Record<string, unknown>;

interface BenchmarkCase {
  id: string;
  scenario: string;
  strength: 'weak' | 'strong' | 'advisory';
  critical: boolean;
  expectedCategory: string | null;
  expectedSecuritySeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  expectedControlBypass?: 'CONFIRMED' | 'UNCERTAIN' | 'NONE';
  production: string;
  test: string;
}

interface BenchmarkCorpus {
  version: string;
  testFramework: string;
  cases: BenchmarkCase[];
}

interface PromotionPolicy {
  version: string;
  requiredRunMode: 'azure';
  minimumCases: number;
  minimumRepetitionsPerCase: number;
  thresholds: {
    minimumBlockingPatternDetectionRate: number;
    maximumStrongFalsePositiveRate: number;
    maximumAdvisoryEscalationRate?: number;
    maximumMissedControlBypassCases?: number;
    maximumMissedCriticalScenarios: number;
    minimumReviewerAgreementRate: number;
    maximumAverageCostUsd: number;
    maximumP95LatencyMs: number;
    maximumErrorRate: number;
    maximumTotalCostUsd?: number;
  };
  invalidationInputs: string[];
}

interface ReviewerLike {
  review(packet: unknown): Promise<JsonObject>;
}

interface CalibrationRun {
  repetition: number;
  decision: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  kind: 'POLICY' | 'PLATFORM' | 'COMPUTE';
  severity: 'INFO' | 'ADVISORY' | 'BLOCKING' | 'ERROR' | 'INCONCLUSIVE';
  blockingCategories: string[];
  diagnostic?: {
    code: string;
    message: string;
  };
  resultFingerprint: string;
  tokensUsed: number;
  estimatedCostUsd: number;
  latencyMs: number;
  error: boolean;
}

interface CalibrationCaseResult {
  id: string;
  runs: CalibrationRun[];
}

interface CalibrationMetrics {
  weakCaseCount: number;
  truePositiveCount: number;
  blockingPatternDetectionRate: number;
  strongCaseCount: number;
  falsePositiveCount: number;
  strongFalsePositiveRate: number;
  advisoryCaseCount?: number;
  advisoryEscalationCount?: number;
  advisoryEscalationRate?: number;
  missedCriticalScenarios: string[];
  missedControlBypassCases?: string[];
  reviewerAgreementRate: number;
  totalTokens: number;
  averageCostUsd: number;
  p95LatencyMs: number;
  errorRate: number;
  platformFailureCount: number;
  computeInconclusiveCount: number;
  diagnosticCodes: string[];
  totalCostUsd?: number;
}

interface CalibrationFingerprint {
  components: JsonObject;
  sha256: string;
}

interface CalibrationReport extends JsonObject {
  schemaVersion: string;
  reportVersion: string;
  agentName?: string;
  corpusVersion: string;
  promotionPolicyVersion: string;
  runMode: 'fixture' | 'azure';
  generatedAt: string;
  repetitionsPerCase: number;
  complete: boolean;
  calibrationFingerprint: CalibrationFingerprint;
  caseResults: CalibrationCaseResult[];
  metrics: CalibrationMetrics;
  reportSha256: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadJson(filePath: string): JsonObject {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(value)) throw new Error(`${filePath} must contain a JSON object`);
  return value;
}

function loadCorpus(repoRoot: string, agentName = 'unit-test-reviewer'): BenchmarkCorpus {
  const registration = loadAgentRegistration(repoRoot, agentName, { allowDisabledForCalibration: true });
  const corpus = loadJson(path.join(repoRoot, registration.benchmarkCorpusFile)) as unknown as BenchmarkCorpus;
  if (
    !/^\d+\.\d+\.\d+$/.test(corpus.version) ||
    !Array.isArray(corpus.cases) ||
    corpus.cases.length < (agentName === 'gilfoyle-security-architect' ? 24 : 18)
  ) {
    throw new Error('Benchmark corpus is incomplete');
  }
  const ids = new Set<string>();
  for (const benchmark of corpus.cases) {
    if (
      !benchmark.id ||
      ids.has(benchmark.id) ||
      !['weak', 'strong', 'advisory'].includes(benchmark.strength) ||
      !benchmark.production ||
      !benchmark.test
    ) {
      throw new Error(`Benchmark case is invalid or duplicated: ${benchmark.id}`);
    }
    ids.add(benchmark.id);
  }
  return corpus;
}

function loadPromotionPolicy(repoRoot: string, agentName = 'unit-test-reviewer'): PromotionPolicy {
  const registration = loadAgentRegistration(repoRoot, agentName, { allowDisabledForCalibration: true });
  const policy = loadJson(path.join(repoRoot, registration.promotionPolicyFile)) as unknown as PromotionPolicy;
  if (policy.version !== '1.0.0' || policy.requiredRunMode !== 'azure' || policy.minimumRepetitionsPerCase < 2) {
    throw new Error('Promotion policy is malformed');
  }
  return policy;
}

function calibrationFingerprint(repoRoot: string, agentName = 'unit-test-reviewer'): CalibrationFingerprint {
  if (agentName === 'gilfoyle-security-architect') {
    const components = expectedReportFingerprintComponents(repoRoot, agentName);
    return { components, sha256: sha256(stableStringify(components)) };
  }
  const registry = loadJson(path.join(repoRoot, 'config/adversarial-agents/shared-v2/agents-config.json'));
  const agents = Array.isArray(registry.agents) ? registry.agents : [];
  const agent = agents.find(
    (candidate): candidate is JsonObject => isObject(candidate) && candidate.name === 'unit-test-reviewer',
  );
  if (!agent) throw new Error('unit-test-reviewer is not registered');
  const corpus = loadCorpus(repoRoot, agentName);
  const schema = loadJson(path.join(repoRoot, 'config/adversarial-agents/shared-v2/schema.json'));
  const policy = loadJson(path.join(repoRoot, 'config/adversarial-agents/shared-v2/policy.json'));
  const reviewerConfigPath = path.join(repoRoot, 'config/adversarial-agents/shared-v2/reviewer-engine.json');
  const reviewerConfig = loadJson(reviewerConfigPath);
  const systemPolicyFile = reviewerConfig.systemPolicyFile;
  if (typeof systemPolicyFile !== 'string') {
    throw new Error('Reviewer system policy file is not configured');
  }
  const components: JsonObject = {
    modelDeployment: agent.modelDeployment,
    modelVersion: agent.modelVersion,
    promptVersion: agent.promptVersion,
    promptContentHash: agent.promptContentHash,
    toolsVersion: agent.toolsVersion,
    testFramework: corpus.testFramework,
    schemaVersion: schema.version,
    schemaContentHash: sha256(fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/shared-v2/schema.json'))),
    policyVersion: policy.version,
    policyContentHash: sha256(fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/shared-v2/policy.json'))),
    architectureContentHash: sha256(fs.readFileSync(path.join(repoRoot, 'docs/architecture.md'))),
    systemPolicyVersion: reviewerConfig.systemPolicyVersion,
    systemPolicyContentHash: sha256(fs.readFileSync(path.join(repoRoot, systemPolicyFile))),
    reviewerEngineConfigVersion: reviewerConfig.version,
    reviewerEngineConfigContentHash: sha256(fs.readFileSync(reviewerConfigPath)),
    benchmarkCorpusVersion: corpus.version,
    benchmarkCorpusContentHash: sha256(
      fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/benchmarks.json')),
    ),
  };
  return { components, sha256: sha256(stableStringify(components)) };
}

function benchmarkPacket(benchmark: BenchmarkCase, index: number, agentName = 'unit-test-reviewer'): JsonObject {
  const headSha = sha256(`benchmark:${benchmark.id}`).slice(0, 40);
  return {
    schemaVersion: '1.0.0',
    collectorVersion: '1.0.0',
    status: 'READY',
    attribution: {
      repository: 'jdylanmc/game-hub-benchmark',
      issueNumber: 30,
      pullRequestNumber: index + 1,
      baseSha: sha256(`base:${benchmark.id}`).slice(0, 40),
      headSha,
      workflowRunId: index + 1,
      workflowRunAttempt: 1,
      inputSha256: sha256(benchmark.id),
      configVersion: '1.0.0',
      configSha256: sha256('benchmark-config'),
    },
    trustBoundary: {
      classification: 'UNTRUSTED_DATA_ONLY',
      executableContentAllowed: false,
      instructionsFromEvidenceAllowed: false,
    },
    benchmark: {
      id: benchmark.id,
      scenario: benchmark.scenario,
      productionDiff: benchmark.production,
      testDiff: benchmark.test,
    },
    changes: {
      production: [
        {
          path: 'src/benchmark.ts',
          startLine: 1,
          endLine: Math.max(1, benchmark.production.split('\n').length),
          patch: benchmark.production,
        },
      ],
      tests: [
        {
          path: 'src/benchmark.test.ts',
          startLine: 1,
          endLine: Math.max(1, benchmark.test.split('\n').length),
          patch: benchmark.test,
        },
      ],
      other: [],
    },
    repositoryContext:
      agentName === 'gilfoyle-security-architect'
        ? {
            securityReviewMode: 'calibration',
            evidenceIsInert: true,
            executableContentAllowed: false,
          }
        : {},
  };
}

function normalizedResult(
  result: JsonObject,
  agentName = 'unit-test-reviewer',
): {
  decision: string;
  kind: string;
  severity: string;
  blockingCategories: string[];
  diagnostic?: {
    code: string;
    message: string;
  };
  tokensUsed: number;
  estimatedCostUsd: number;
  error: boolean;
  fingerprint: string;
} {
  const verdict = isObject(result.verdict) ? result.verdict : {};
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const blockingCategories = findings
    .filter(
      (finding) =>
        isObject(finding) &&
        finding.severity === 'BLOCKING' &&
        (agentName === 'gilfoyle-security-architect' || finding.confidence === 'HIGH'),
    )
    .map((finding) => String((finding as JsonObject).category))
    .sort();
  const summary = isObject(result.summary) ? result.summary : {};
  const kind = String(verdict.kind ?? 'UNKNOWN');
  const sourceDiagnostic =
    kind === 'PLATFORM' && isObject(verdict.platformError)
      ? verdict.platformError
      : kind === 'COMPUTE' && isObject(verdict.compute)
        ? verdict.compute
        : undefined;
  const diagnostic =
    sourceDiagnostic && typeof sourceDiagnostic.code === 'string' && typeof sourceDiagnostic.message === 'string'
      ? { code: sourceDiagnostic.code, message: sourceDiagnostic.message }
      : undefined;
  const normalized = {
    decision: String(verdict.decision ?? 'FAIL'),
    kind,
    severity: String(verdict.severity ?? 'ERROR'),
    blockingCategories,
    ...(diagnostic ? { diagnostic } : {}),
  };
  return {
    ...normalized,
    tokensUsed: Number(summary.tokensUsed ?? 0),
    estimatedCostUsd: Number(summary.estimatedCost ?? 0),
    error: normalized.decision === 'FAIL' && normalized.kind === 'PLATFORM',
    fingerprint: sha256(stableStringify(normalized)),
  };
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function computeMetrics(
  corpus: BenchmarkCorpus,
  caseResults: CalibrationCaseResult[],
  agentName = 'unit-test-reviewer',
): CalibrationMetrics {
  const byId = new Map(caseResults.map((result) => [result.id, result]));
  const weakCases = corpus.cases.filter((benchmark) => benchmark.strength === 'weak');
  const strongCases = corpus.cases.filter((benchmark) =>
    agentName === 'gilfoyle-security-architect' ? benchmark.strength === 'strong' : benchmark.strength !== 'weak',
  );
  const advisoryCases = corpus.cases.filter((benchmark) => benchmark.strength === 'advisory');
  const detected = weakCases.filter((benchmark) => {
    const runs = byId.get(benchmark.id)?.runs ?? [];
    return runs.every((run) => run.decision === 'FAIL' && run.kind === 'POLICY' && run.blockingCategories.length > 0);
  });
  const falsePositives = strongCases.filter((benchmark) =>
    (byId.get(benchmark.id)?.runs ?? []).some((run) => run.decision === 'FAIL' && run.kind === 'POLICY'),
  );
  const missedCriticalScenarios = weakCases
    .filter((benchmark) => benchmark.critical && !detected.includes(benchmark))
    .map((benchmark) => benchmark.id)
    .sort();
  const missedControlBypassCases = weakCases
    .filter(
      (benchmark) =>
        ['CONFIRMED', 'UNCERTAIN'].includes(String(benchmark.expectedControlBypass)) && !detected.includes(benchmark),
    )
    .map((benchmark) => benchmark.id)
    .sort();
  const advisoryEscalations = advisoryCases.filter((benchmark) =>
    (byId.get(benchmark.id)?.runs ?? []).some((run) => run.decision === 'FAIL' && run.kind === 'POLICY'),
  );
  let agreementComparisons = 0;
  let agreements = 0;
  for (const result of caseResults) {
    const fingerprintCounts = new Map<string, number>();
    for (const run of result.runs) {
      fingerprintCounts.set(run.resultFingerprint, (fingerprintCounts.get(run.resultFingerprint) ?? 0) + 1);
    }
    agreementComparisons += result.runs.length;
    agreements += Math.max(0, ...fingerprintCounts.values());
  }
  const runs = caseResults.flatMap((result) => result.runs);
  const totalCost = runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0);
  const errors = runs.filter((run) => run.error).length;
  const metrics: CalibrationMetrics = {
    weakCaseCount: weakCases.length,
    truePositiveCount: detected.length,
    blockingPatternDetectionRate: rounded(detected.length / Math.max(1, weakCases.length)),
    strongCaseCount: strongCases.length,
    falsePositiveCount: falsePositives.length,
    strongFalsePositiveRate: rounded(falsePositives.length / Math.max(1, strongCases.length)),
    missedCriticalScenarios,
    reviewerAgreementRate: rounded(agreementComparisons === 0 ? 0 : agreements / agreementComparisons),
    totalTokens: runs.reduce((sum, run) => sum + run.tokensUsed, 0),
    averageCostUsd: rounded(totalCost / Math.max(1, runs.length)),
    p95LatencyMs: percentile95(runs.map((run) => run.latencyMs)),
    errorRate: rounded(errors / Math.max(1, runs.length)),
    platformFailureCount: runs.filter((run) => run.kind === 'PLATFORM').length,
    computeInconclusiveCount: runs.filter((run) => run.kind === 'COMPUTE').length,
    diagnosticCodes: [...new Set(runs.flatMap((run) => (run.diagnostic ? [run.diagnostic.code] : [])))].sort(),
  };
  if (agentName === 'gilfoyle-security-architect') {
    metrics.advisoryCaseCount = advisoryCases.length;
    metrics.advisoryEscalationCount = advisoryEscalations.length;
    metrics.advisoryEscalationRate = rounded(advisoryEscalations.length / Math.max(1, advisoryCases.length));
    metrics.missedControlBypassCases = missedControlBypassCases;
    metrics.totalCostUsd = rounded(totalCost);
  }
  return metrics;
}

function reportHash(report: JsonObject): string {
  const unsigned = Object.fromEntries(Object.entries(report).filter(([property]) => property !== 'reportSha256'));
  return sha256(stableStringify(unsigned));
}

function calibrationRunFingerprint(value: {
  decision: string;
  kind: string;
  severity: string;
  blockingCategories: string[];
  diagnostic?: {
    code: string;
    message: string;
  };
}): string {
  return sha256(
    stableStringify({
      decision: value.decision,
      kind: value.kind,
      severity: value.severity,
      blockingCategories: value.blockingCategories,
      ...(value.diagnostic ? { diagnostic: value.diagnostic } : {}),
    }),
  );
}

function isCalibrationRun(value: unknown): value is CalibrationRun {
  if (!isObject(value)) return false;
  const blockingCategories = value.blockingCategories;
  const decision = value.decision;
  const kind = value.kind;
  const severity = value.severity;
  const diagnostic = isObject(value.diagnostic)
    ? {
        code: value.diagnostic.code,
        message: value.diagnostic.message,
      }
    : undefined;
  const validDiagnostic =
    diagnostic === undefined ||
    (typeof diagnostic.code === 'string' &&
      diagnostic.code.length > 0 &&
      typeof diagnostic.message === 'string' &&
      diagnostic.message.length > 0);
  const normalizedFingerprint =
    typeof decision === 'string' &&
    typeof kind === 'string' &&
    typeof severity === 'string' &&
    Array.isArray(blockingCategories) &&
    blockingCategories.every((category) => typeof category === 'string') &&
    validDiagnostic
      ? calibrationRunFingerprint({
          decision,
          kind,
          severity,
          blockingCategories,
          ...(diagnostic && typeof diagnostic.code === 'string' && typeof diagnostic.message === 'string'
            ? { diagnostic: { code: diagnostic.code, message: diagnostic.message } }
            : {}),
        })
      : '';
  const policyPass = decision === 'PASS' && kind === 'POLICY' && ['INFO', 'ADVISORY'].includes(String(severity));
  const policyFail =
    decision === 'FAIL' && kind === 'POLICY' && severity === 'BLOCKING' && blockingCategories.length > 0;
  const platformFail =
    decision === 'FAIL' &&
    kind === 'PLATFORM' &&
    severity === 'ERROR' &&
    blockingCategories.length === 0 &&
    diagnostic !== undefined;
  const computeInconclusive =
    decision === 'INCONCLUSIVE' &&
    kind === 'COMPUTE' &&
    severity === 'INCONCLUSIVE' &&
    blockingCategories.length === 0 &&
    diagnostic !== undefined;
  return (
    Number.isInteger(value.repetition) &&
    ['PASS', 'FAIL', 'INCONCLUSIVE'].includes(String(decision)) &&
    ['POLICY', 'PLATFORM', 'COMPUTE'].includes(String(kind)) &&
    ['INFO', 'ADVISORY', 'BLOCKING', 'ERROR', 'INCONCLUSIVE'].includes(String(severity)) &&
    (policyPass || policyFail || platformFail || computeInconclusive) &&
    Array.isArray(blockingCategories) &&
    stableStringify(blockingCategories) === stableStringify([...new Set(blockingCategories)].sort()) &&
    value.resultFingerprint === normalizedFingerprint &&
    [value.tokensUsed, value.estimatedCostUsd, value.latencyMs].every(
      (metric) => typeof metric === 'number' && Number.isFinite(metric) && metric >= 0,
    ) &&
    value.error === platformFail
  );
}

async function evaluateBenchmarks(options: {
  repoRoot: string;
  agentName?: string;
  runMode: 'fixture' | 'azure';
  repetitionsPerCase: number;
  reviewerFactory: (benchmark: BenchmarkCase, repetition: number, index: number) => ReviewerLike;
  now?: () => number;
  generatedAt?: string;
}): Promise<CalibrationReport> {
  const agentName = options.agentName ?? 'unit-test-reviewer';
  const corpus = loadCorpus(options.repoRoot, agentName);
  const promotionPolicy = loadPromotionPolicy(options.repoRoot, agentName);
  if (options.repetitionsPerCase < 1) throw new Error('At least one repetition is required');
  const now = options.now ?? Date.now;
  const caseResults: CalibrationCaseResult[] = [];
  const cases = [...corpus.cases].sort((left, right) => left.id.localeCompare(right.id));
  for (let index = 0; index < cases.length; index += 1) {
    const benchmark = cases[index];
    const runs: CalibrationRun[] = [];
    for (let repetition = 0; repetition < options.repetitionsPerCase; repetition += 1) {
      const reviewer = options.reviewerFactory(benchmark, repetition, index);
      const start = now();
      const result = await reviewer.review(benchmarkPacket(benchmark, index, agentName));
      const latencyMs = Math.max(0, now() - start);
      const normalized = normalizedResult(result, agentName);
      runs.push({
        repetition,
        decision: normalized.decision as CalibrationRun['decision'],
        kind: normalized.kind as CalibrationRun['kind'],
        severity: normalized.severity as CalibrationRun['severity'],
        blockingCategories: normalized.blockingCategories,
        ...(normalized.diagnostic ? { diagnostic: normalized.diagnostic } : {}),
        resultFingerprint: normalized.fingerprint,
        tokensUsed: normalized.tokensUsed,
        estimatedCostUsd: normalized.estimatedCostUsd,
        latencyMs,
        error: normalized.error,
      });
    }
    caseResults.push({ id: benchmark.id, runs });
  }
  const report: CalibrationReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportVersion: '1.0.0',
    ...(agentName === 'gilfoyle-security-architect' ? { agentName } : {}),
    corpusVersion: corpus.version,
    promotionPolicyVersion: promotionPolicy.version,
    runMode: options.runMode,
    generatedAt: options.generatedAt ?? new Date(now()).toISOString(),
    repetitionsPerCase: options.repetitionsPerCase,
    complete: true,
    calibrationFingerprint: calibrationFingerprint(options.repoRoot, agentName),
    caseResults,
    metrics: computeMetrics(corpus, caseResults, agentName),
    reportSha256: '',
  };
  report.reportSha256 = reportHash(report);
  return report;
}

function validatePromotionReport(
  repoRoot: string,
  value: unknown,
  agentName = 'unit-test-reviewer',
): { promotable: boolean; reasons: string[]; metrics?: CalibrationMetrics } {
  const reasons: string[] = [];
  if (!isObject(value)) return { promotable: false, reasons: ['Report must be a JSON object.'] };
  const report = value as unknown as CalibrationReport;
  const corpus = loadCorpus(repoRoot, agentName);
  const policy = loadPromotionPolicy(repoRoot, agentName);
  if (report.reportSha256 !== reportHash(report)) reasons.push('Report hash is invalid.');
  if (
    report.schemaVersion !== REPORT_SCHEMA_VERSION ||
    report.reportVersion !== '1.0.0' ||
    report.corpusVersion !== corpus.version ||
    report.promotionPolicyVersion !== policy.version
  ) {
    reasons.push('Report, corpus, or promotion policy version is stale.');
  }
  if (report.runMode !== policy.requiredRunMode) {
    reasons.push('Only a real Azure calibration run can promote the check.');
  }
  if (report.complete !== true) reasons.push('Calibration report is incomplete.');
  if (agentName === 'gilfoyle-security-architect' && report.agentName !== 'gilfoyle-security-architect') {
    reasons.push('Calibration report agent identity is invalid.');
  }
  if (stableStringify(report.calibrationFingerprint) !== stableStringify(calibrationFingerprint(repoRoot, agentName))) {
    reasons.push('Calibration fingerprint is stale.');
  }
  const structurallyValidCaseResults =
    Number.isInteger(report.repetitionsPerCase) &&
    report.repetitionsPerCase > 0 &&
    Array.isArray(report.caseResults) &&
    report.caseResults.every(
      (result) =>
        isObject(result) &&
        typeof result.id === 'string' &&
        Array.isArray(result.runs) &&
        result.runs.every(isCalibrationRun) &&
        result.runs.every((run, index) => run.repetition === index),
    );
  if (!structurallyValidCaseResults) {
    reasons.push('Report case evidence is malformed.');
    return { promotable: false, reasons };
  }
  const expectedIds = corpus.cases.map((benchmark) => benchmark.id).sort();
  const actualIds = report.caseResults.map((result) => result.id).sort();
  if (
    expectedIds.length < policy.minimumCases ||
    stableStringify(expectedIds) !== stableStringify(actualIds) ||
    report.repetitionsPerCase < policy.minimumRepetitionsPerCase ||
    report.caseResults?.some((result) => result.runs.length !== report.repetitionsPerCase)
  ) {
    reasons.push('Required benchmark cases or repetitions are missing.');
  }
  const computedMetrics = computeMetrics(corpus, report.caseResults, agentName);
  if (stableStringify(report.metrics) !== stableStringify(computedMetrics)) {
    reasons.push('Reported metrics do not match case evidence.');
  }
  const thresholds = policy.thresholds;
  if (computedMetrics.blockingPatternDetectionRate < thresholds.minimumBlockingPatternDetectionRate) {
    reasons.push('Blocking-pattern detection threshold failed.');
  }
  if (computedMetrics.strongFalsePositiveRate > thresholds.maximumStrongFalsePositiveRate) {
    reasons.push('Strong-example false-positive threshold failed.');
  }
  if (
    thresholds.maximumAdvisoryEscalationRate !== undefined &&
    Number(computedMetrics.advisoryEscalationRate) > thresholds.maximumAdvisoryEscalationRate
  ) {
    reasons.push('Advisory-case escalation threshold failed.');
  }
  if (computedMetrics.missedCriticalScenarios.length > thresholds.maximumMissedCriticalScenarios) {
    reasons.push('Critical scenarios were missed.');
  }
  if (
    thresholds.maximumMissedControlBypassCases !== undefined &&
    (computedMetrics.missedControlBypassCases?.length ?? 0) > thresholds.maximumMissedControlBypassCases
  ) {
    reasons.push('Security-control bypass cases were missed.');
  }
  if (computedMetrics.reviewerAgreementRate < thresholds.minimumReviewerAgreementRate) {
    reasons.push('Reviewer agreement threshold failed.');
  }
  if (computedMetrics.averageCostUsd > thresholds.maximumAverageCostUsd) {
    reasons.push('Average cost threshold failed.');
  }
  if (computedMetrics.p95LatencyMs > thresholds.maximumP95LatencyMs) {
    reasons.push('Latency threshold failed.');
  }
  if (computedMetrics.errorRate > thresholds.maximumErrorRate) {
    reasons.push('Reviewer error-rate threshold failed.');
  }
  if (
    thresholds.maximumTotalCostUsd !== undefined &&
    Number(computedMetrics.totalCostUsd) > thresholds.maximumTotalCostUsd
  ) {
    reasons.push('Total calibration cost threshold failed.');
  }
  return { promotable: reasons.length === 0, reasons, metrics: computedMetrics };
}

function oracleFinding(benchmark: BenchmarkCase, agentName = 'unit-test-reviewer'): JsonObject {
  const proposedSeverity = benchmark.strength === 'advisory' ? 'ADVISORY' : 'BLOCKING';
  const citations = {
    productionFiles: [
      {
        path: 'src/benchmark.ts',
        startLine: 1,
        endLine: Math.max(1, benchmark.production.split('\n').length),
        snippet: benchmark.production,
      },
    ],
    testFiles: [
      {
        path: 'src/benchmark.test.ts',
        startLine: 1,
        endLine: Math.max(1, benchmark.test.split('\n').length),
        snippet: benchmark.test,
      },
    ],
  };
  return {
    id: `${benchmark.expectedCategory?.toUpperCase().replace(/-/g, '') ?? 'BENCHMARK'}-1`,
    title: `${agentName === 'gilfoyle-security-architect' ? 'Unsafe' : 'Weak'} ${benchmark.scenario}`,
    category: benchmark.expectedCategory ?? 'other',
    proposedSeverity,
    severity: proposedSeverity,
    confidence: proposedSeverity === 'BLOCKING' ? 'HIGH' : 'MEDIUM',
    description: `The benchmark intentionally contains a ${benchmark.scenario} weakness.`,
    citations,
    policyRule: 'Calibrated high-confidence blockers require remediation and verification.',
    failureScenario: `The unsafe ${benchmark.scenario} behavior reaches the production trust boundary.`,
    impact: 'The weakness can merge undetected or violate the expected control.',
    remediation: ['Apply the safe paired benchmark control.'],
    verificationGuidance: 'Run the paired safe benchmark and negative abuse case.',
    ...(proposedSeverity === 'BLOCKING'
      ? {
          critic: {
            decision: 'CONFIRM',
            rationale: 'The benchmark evidence directly demonstrates the proposed blocker.',
            citations,
          },
        }
      : {}),
  };
}

function oracleModelResult(benchmark: BenchmarkCase, agentName = 'unit-test-reviewer'): JsonObject {
  const findings =
    benchmark.strength === 'weak' || benchmark.strength === 'advisory' ? [oracleFinding(benchmark, agentName)] : [];
  const blocking = findings.some((finding) => finding.severity === 'BLOCKING');
  return {
    schemaVersion: '1.0.0',
    findingVersion: 'ignored@2000-01-01T00:00:00Z',
    attribution: {},
    verdict: {
      decision: blocking ? 'FAIL' : 'PASS',
      kind: 'POLICY',
      severity: blocking ? 'BLOCKING' : findings.length > 0 ? 'ADVISORY' : 'INFO',
      blockingFindingsCount: blocking ? findings.length : 0,
      advisoryFindingsCount: blocking ? 0 : findings.length,
      policyDecisionRationale: 'Deterministic benchmark oracle.',
    },
    findings,
  };
}

function createFixtureReviewer(
  repoRoot: string,
  benchmark: BenchmarkCase,
  agentName = 'unit-test-reviewer',
): AdversarialReviewerEngine {
  const criticResponse = {
    decision: 'CONFIRM',
    rationale: 'The benchmark evidence directly demonstrates the proposed blocker.',
    citations: [
      {
        path: 'src/benchmark.ts',
        startLine: 1,
        endLine: Math.max(1, benchmark.production.split('\n').length),
        snippet: benchmark.production,
      },
      {
        path: 'src/benchmark.test.ts',
        startLine: 1,
        endLine: Math.max(1, benchmark.test.split('\n').length),
        snippet: benchmark.test,
      },
    ],
  };
  const transport = {
    complete: async (request: { messages: Array<{ content: string }> }) => ({
      content: JSON.stringify(
        request.messages[1]?.content.startsWith('Critic review:')
          ? criticResponse
          : oracleModelResult(benchmark, agentName),
      ),
      promptTokens: 1000,
      completionTokens: 500,
    }),
  };
  return new AdversarialReviewerEngine({
    repoRoot,
    endpoint: 'https://fixture.openai.azure.com',
    deploymentId:
      agentName === 'gilfoyle-security-architect'
        ? 'game-hub-gilfoyle-security-architect'
        : 'game-hub-unit-test-reviewer',
    agentName,
    calibrationMode: agentName === 'gilfoyle-security-architect',
    transport,
    clock: {
      now: () => Date.parse('2000-01-01T00:00:00Z'),
      sleep: async () => {},
    },
  });
}

function parseArguments(args: string[]): {
  mode: 'fixture' | 'azure' | 'check';
  outputPath?: string;
  reportPath?: string;
  repetitions: number;
  agentName: string;
} {
  let mode: 'fixture' | 'azure' | 'check' = 'fixture';
  let outputPath: string | undefined;
  let reportPath: string | undefined;
  let repetitions = 2;
  let agentName = 'unit-test-reviewer';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--mode') {
      const value = args[++index];
      if (!['fixture', 'azure', 'check'].includes(value)) throw new Error('Invalid mode');
      mode = value as 'fixture' | 'azure' | 'check';
    } else if (args[index] === '--output') outputPath = args[++index];
    else if (args[index] === '--report') reportPath = args[++index];
    else if (args[index] === '--repetitions') repetitions = Number(args[++index]);
    else if (args[index] === '--agent') agentName = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agentName)) throw new Error('Invalid agent name');
  return { mode, outputPath, reportPath, repetitions, agentName };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = parseArguments(process.argv.slice(2));
  if (args.mode === 'check') {
    if (!args.reportPath) throw new Error('--report is required in check mode');
    const report: unknown = JSON.parse(fs.readFileSync(path.resolve(repoRoot, args.reportPath), 'utf8'));
    const result = validatePromotionReport(repoRoot, report, args.agentName);
    process.stdout.write(`${stableStringify(result, 2)}\n`);
    process.exitCode = result.promotable ? 0 : 3;
    return;
  }
  let logicalTime = Date.parse('2000-01-01T00:00:00Z');
  const report = await evaluateBenchmarks({
    repoRoot,
    agentName: args.agentName,
    runMode: args.mode,
    repetitionsPerCase: args.repetitions,
    generatedAt: args.mode === 'fixture' ? '2000-01-01T00:00:00.000Z' : new Date().toISOString(),
    now:
      args.mode === 'fixture'
        ? () => {
            logicalTime += 10;
            return logicalTime;
          }
        : Date.now,
    reviewerFactory:
      args.mode === 'fixture'
        ? (benchmark) => createFixtureReviewer(repoRoot, benchmark, args.agentName)
        : () => createReviewerFromEnvironment(repoRoot),
  });
  const serialized = `${stableStringify(report, 2)}\n`;
  if (args.outputPath) {
    const outputPath = path.resolve(repoRoot, args.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  } else {
    process.stdout.write(serialized);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  benchmarkPacket,
  calibrationRunFingerprint,
  calibrationFingerprint,
  computeMetrics,
  createFixtureReviewer,
  evaluateBenchmarks,
  loadCorpus,
  loadPromotionPolicy,
  reportHash,
  validatePromotionReport,
};
export type { BenchmarkCase, CalibrationMetrics, CalibrationReport, PromotionPolicy };
