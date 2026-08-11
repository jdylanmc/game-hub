import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  calibrationFingerprint,
  computeMetrics,
  createFixtureReviewer,
  evaluateBenchmarks,
  loadCorpus,
  loadPromotionPolicy,
  reportHash,
  validatePromotionReport,
} from './evaluate-adversarial-reviewer.ts';
import { stableStringify } from './collect-adversarial-context.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = loadPromotionPolicy(repoRoot);

async function fixtureReport() {
  let time = 0;
  return evaluateBenchmarks({
    repoRoot,
    runMode: 'fixture',
    repetitionsPerCase: 2,
    generatedAt: '2000-01-01T00:00:00.000Z',
    now: () => {
      time += 10;
      return time;
    },
    reviewerFactory: (benchmark) => createFixtureReviewer(repoRoot, benchmark),
  });
}

async function passingAzureReport() {
  const report = await fixtureReport();
  report.runMode = 'azure';
  report.reportSha256 = reportHash(report);
  return report;
}

function clone(value) {
  return structuredClone(value);
}

function refreshMetricsAndHash(report) {
  report.metrics = computeMetrics(loadCorpus(repoRoot), report.caseResults);
  report.reportSha256 = reportHash(report);
  return report;
}

function refreshRunFingerprint(run) {
  run.resultFingerprint = crypto
    .createHash('sha256')
    .update(
      stableStringify({
        decision: run.decision,
        severity: run.severity,
        blockingCategories: run.blockingCategories,
      }),
    )
    .digest('hex');
}

describe('adversarial benchmark corpus', () => {
  it('contains paired weak and strong coverage for every required scenario', () => {
    const corpus = loadCorpus(repoRoot);
    const scenarios = [
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

    expect(corpus.cases).toHaveLength(18);
    for (const scenario of scenarios) {
      expect(
        corpus.cases.filter((benchmark) => benchmark.scenario === scenario).map((benchmark) => benchmark.strength),
      ).toEqual(['weak', 'strong']);
    }
  });

  it('produces deterministic complete metrics through fake reviewer transports', async () => {
    const first = await fixtureReport();
    const second = await fixtureReport();

    expect(first).toEqual(second);
    expect(first.complete).toBe(true);
    expect(first.caseResults).toHaveLength(18);
    expect(first.metrics).toEqual({
      weakCaseCount: 9,
      truePositiveCount: 9,
      blockingPatternDetectionRate: 1,
      strongCaseCount: 9,
      falsePositiveCount: 0,
      strongFalsePositiveRate: 0,
      missedCriticalScenarios: [],
      reviewerAgreementRate: 1,
      totalTokens: 54000,
      averageCostUsd: 0.0012,
      p95LatencyMs: 10,
      errorRate: 0,
    });
    expect(first.reportSha256).toBe(reportHash(first));
  });
});

describe('calibration promotion gate', () => {
  it('allows only a complete real-Azure report that passes every threshold', async () => {
    const report = await passingAzureReport();
    expect(validatePromotionReport(repoRoot, report)).toMatchObject({
      promotable: true,
      reasons: [],
    });
  });

  it('rejects an uncalibrated fixture report', async () => {
    const report = await fixtureReport();
    expect(validatePromotionReport(repoRoot, report)).toMatchObject({
      promotable: false,
      reasons: expect.arrayContaining([expect.stringContaining('Only a real Azure calibration run')]),
    });
  });

  it('rejects stale reports for every required invalidation input', async () => {
    const baseline = await passingAzureReport();
    const componentNames = policy.invalidationInputs;

    for (const component of componentNames) {
      const report = clone(baseline);
      report.calibrationFingerprint.components[component] = `stale-${component}`;
      report.calibrationFingerprint.sha256 = 'f'.repeat(64);
      report.reportSha256 = reportHash(report);
      expect(validatePromotionReport(repoRoot, report).reasons, component).toContain(
        'Calibration fingerprint is stale.',
      );
    }
  });

  it('rejects incomplete cases and repetitions', async () => {
    const report = await passingAzureReport();
    report.caseResults.pop();
    report.complete = false;
    refreshMetricsAndHash(report);

    const result = validatePromotionReport(repoRoot, report);
    expect(result.promotable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'Calibration report is incomplete.',
        'Required benchmark cases or repetitions are missing.',
      ]),
    );
  });

  it('rejects malformed case evidence without evaluating it', async () => {
    const report = await passingAzureReport();
    report.caseResults[0].runs = [{ repetition: 0 }];
    report.reportSha256 = reportHash(report);

    expect(validatePromotionReport(repoRoot, report)).toMatchObject({
      promotable: false,
      reasons: expect.arrayContaining(['Report case evidence is malformed.']),
    });
  });

  it('rejects internally inconsistent run evidence even with a refreshed report hash', async () => {
    const report = await passingAzureReport();
    report.caseResults[0].runs[0].decision = 'FAIL';
    report.reportSha256 = reportHash(report);

    expect(validatePromotionReport(repoRoot, report)).toMatchObject({
      promotable: false,
      reasons: expect.arrayContaining(['Report case evidence is malformed.']),
    });
  });

  it('rejects missed blocking patterns and critical scenarios', async () => {
    const report = await passingAzureReport();
    const weak = report.caseResults.find((result) => result.id === 'tautology-weak');
    for (const run of weak.runs) {
      run.decision = 'PASS';
      run.severity = 'INFO';
      run.blockingCategories = [];
      refreshRunFingerprint(run);
    }
    refreshMetricsAndHash(report);

    const result = validatePromotionReport(repoRoot, report);
    expect(result.promotable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['Blocking-pattern detection threshold failed.', 'Critical scenarios were missed.']),
    );
  });

  it('rejects strong-example false positives', async () => {
    const report = await passingAzureReport();
    const strong = report.caseResults.find((result) => result.id === 'tautology-strong');
    strong.runs[0].decision = 'FAIL';
    strong.runs[0].severity = 'BLOCKING';
    strong.runs[0].blockingCategories = ['tautology'];
    refreshRunFingerprint(strong.runs[0]);
    refreshMetricsAndHash(report);

    expect(validatePromotionReport(repoRoot, report).reasons).toContain(
      'Strong-example false-positive threshold failed.',
    );
  });

  it('rejects reviewer disagreement, excessive cost, latency, and errors', async () => {
    const report = await passingAzureReport();
    const run = report.caseResults[0].runs[1];
    run.error = true;
    run.decision = 'ERROR';
    run.severity = 'ERROR';
    run.blockingCategories = ['model-error'];
    refreshRunFingerprint(run);
    for (const result of report.caseResults) {
      for (const measuredRun of result.runs) {
        measuredRun.estimatedCostUsd = 0.2;
        measuredRun.latencyMs = 70000;
      }
    }
    refreshMetricsAndHash(report);

    expect(validatePromotionReport(repoRoot, report).reasons).toEqual(
      expect.arrayContaining([
        'Reviewer agreement threshold failed.',
        'Average cost threshold failed.',
        'Latency threshold failed.',
        'Reviewer error-rate threshold failed.',
      ]),
    );
  });

  it('rejects tampered report evidence even when headline metrics still pass', async () => {
    const report = await passingAzureReport();
    report.caseResults[0].runs[0].tokensUsed += 1;

    expect(validatePromotionReport(repoRoot, report).reasons).toContain('Report hash is invalid.');
  });

  it('rejects headline metrics that do not reconcile to case evidence', async () => {
    const report = await passingAzureReport();
    report.metrics.truePositiveCount = 0;
    report.reportSha256 = reportHash(report);

    expect(validatePromotionReport(repoRoot, report).reasons).toContain('Reported metrics do not match case evidence.');
  });

  it('binds the current fingerprint to all reviewed source versions', () => {
    const fingerprint = calibrationFingerprint(repoRoot);
    expect(fingerprint.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint.components).toMatchObject({
      modelDeployment: 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard',
      modelVersion: '2025-04-14',
      promptVersion: '1.0.0',
      toolsVersion: '1.0.0',
      testFramework: 'vitest@4.1.10',
      schemaVersion: '1.0.0',
      policyVersion: '1.0.0',
      systemPolicyVersion: '1.0.0',
      reviewerEngineConfigVersion: '1.0.0',
      benchmarkCorpusVersion: '1.0.0',
    });
    expect(fingerprint.components.systemPolicyContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint.components.reviewerEngineConfigContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint.components.benchmarkCorpusContentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
