import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildCalibrationAttestationPredicate,
  expectedReportFingerprintComponents,
  reportHash,
} from './shared-v2/calibration-attestation.ts';
import { stableStringify } from './shared-v2/collect-adversarial-context.ts';
import {
  createFixtureReviewer,
  evaluateBenchmarks,
  loadCorpus,
  validatePromotionReport,
} from './shared-v2/evaluate-adversarial-reviewer.ts';
import { validateAgentRegistry } from './shared-v2/validate-adversarial-agent-registry.ts';
import { AdversarialReviewerEngine, ReviewerTransportError } from './shared-v2/review-adversarial-context.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = path.join(repoRoot, 'scripts/.test-artifacts/shared-v2-cli');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('shared v2 staging core', () => {
  it('runs the inactive registry, reviewer core, and calibration evaluator without referencing active v1 runtime', async () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/shared-v2/agents-config.json'), 'utf8'),
    );
    expect(validateAgentRegistry(repoRoot, registry)).toMatchObject({ valid: true, errors: [] });

    let timestamp = 0;
    const report = await evaluateBenchmarks({
      repoRoot,
      runMode: 'fixture',
      repetitionsPerCase: 2,
      generatedAt: '2000-01-01T00:00:00.000Z',
      now: () => {
        timestamp += 10;
        return timestamp;
      },
      reviewerFactory: (benchmark) => createFixtureReviewer(repoRoot, benchmark),
    });

    expect(loadCorpus(repoRoot).cases).toHaveLength(18);
    expect(report.metrics).toMatchObject({
      blockingPatternDetectionRate: 1,
      strongFalsePositiveRate: 0,
      missedCriticalScenarios: [],
      errorRate: 0,
    });
    expect(validatePromotionReport(repoRoot, report)).toMatchObject({
      promotable: false,
      reasons: expect.arrayContaining([expect.stringContaining('Only a real Azure calibration run')]),
    });
  });

  it('runs evaluator and reviewer CLIs from the repository root and binds unit v2 attestation identity', () => {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
    fs.mkdirSync(fixtureDirectory, { recursive: true });
    const inputPath = path.join(fixtureDirectory, 'context.json');
    const reviewOutput = path.join(fixtureDirectory, 'review.json');
    const evaluationOutput = path.join(fixtureDirectory, 'evaluation.json');
    const reportPath = path.join(fixtureDirectory, 'attestation-report.json');
    const headSha = 'a'.repeat(40);
    fs.writeFileSync(
      inputPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        collectorVersion: '1.0.0',
        status: 'READY',
        attribution: {
          repository: 'jdylanmc/game-hub',
          issueNumber: 58,
          pullRequestNumber: 63,
          baseSha: 'b'.repeat(40),
          headSha,
          workflowRunId: 1,
          workflowRunAttempt: 1,
        },
        changes: { production: [], tests: [], other: [] },
      }),
    );

    execFileSync(
      'node',
      [
        'scripts/shared-v2/evaluate-adversarial-reviewer.ts',
        '--mode',
        'fixture',
        '--output',
        path.relative(repoRoot, evaluationOutput),
      ],
      { cwd: repoRoot, stdio: 'pipe' },
    );
    execFileSync(
      'node',
      [
        'scripts/shared-v2/review-adversarial-context.ts',
        '--fixture',
        '--input',
        path.relative(repoRoot, inputPath),
        '--output',
        path.relative(repoRoot, reviewOutput),
      ],
      { cwd: repoRoot, stdio: 'pipe' },
    );
    expect(JSON.parse(fs.readFileSync(evaluationOutput, 'utf8')).runMode).toBe('fixture');
    expect(JSON.parse(fs.readFileSync(reviewOutput, 'utf8')).verdict.decision).toBe('PASS');

    const components = expectedReportFingerprintComponents(repoRoot, 'unit-test-reviewer');
    const report = {
      schemaVersion: '1.0.0',
      reportVersion: '1.0.0',
      agentName: 'unit-test-reviewer',
      corpusVersion: '1.0.4',
      promotionPolicyVersion: '1.0.0',
      runMode: 'azure',
      generatedAt: '2026-08-13T10:00:00.000Z',
      repetitionsPerCase: 2,
      complete: true,
      calibrationFingerprint: { components, sha256: sha256(stableStringify(components)) },
      caseResults: [],
      metrics: {},
      reportSha256: '',
    };
    report.reportSha256 = reportHash(report);
    fs.writeFileSync(reportPath, JSON.stringify(report));
    const predicate = buildCalibrationAttestationPredicate({
      repoRoot,
      agentName: 'unit-test-reviewer',
      reportPath,
      artifactId: '1',
      artifactName: 'unit-test-reviewer-calibration',
      artifactDigest: 'c'.repeat(64),
      repository: 'jdylanmc/game-hub',
      repositoryId: '1330993568',
      repositoryOwnerId: '6954990',
      ref: 'refs/heads/main',
      headSha,
      workflowName: 'Adversarial calibration',
      workflowPath: '.github/workflows/adversarial-calibration.yml',
      workflowRef: 'jdylanmc/game-hub/.github/workflows/adversarial-calibration.yml@refs/heads/main',
      workflowSha: headSha,
      workflowStartedAt: '2026-08-13T09:55:00.000Z',
      runId: '1',
      runAttempt: 1,
      eventName: 'workflow_dispatch',
      environment: 'adversarial-review',
      azureTenantId: '11111111-1111-4111-8111-111111111111',
      azureClientId: '22222222-2222-4222-8222-222222222222',
      azureResourceId:
        '/subscriptions/11213dbd-39fe-46ba-87db-5f5e8c449aed/resourceGroups/game-hub-adversarial-agents-prod/providers/Microsoft.CognitiveServices/accounts/game-hub-adversarial-openai/deployments/game-hub-unit-test-reviewer',
      azureEndpoint: 'https://game-hub-adversarial-openai.openai.azure.com',
      attestedAt: '2026-08-13T10:05:00.000Z',
    });
    expect(predicate.agentConfiguration.agentName).toBe('unit-test-reviewer');
    expect(predicate.azureDeployment.deploymentId).toBe('game-hub-unit-test-reviewer');
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  it('returns critic INCONCLUSIVE semantics after exactly three retryable critic outages', async () => {
    const citation = {
      path: 'src/example.test.ts',
      startLine: 1,
      endLine: 1,
      snippet: 'expect(true).toBe(true);',
    };
    let criticAttempts = 0;
    const reviewer = new AdversarialReviewerEngine({
      repoRoot,
      endpoint: 'https://fixture.openai.azure.com',
      deploymentId: 'game-hub-unit-test-reviewer',
      clock: { now: () => Date.parse('2026-08-13T10:00:00Z'), sleep: async () => {} },
      transport: {
        complete: async () => ({
          content: JSON.stringify({
            verdict: {
              decision: 'FAIL',
              kind: 'POLICY',
              severity: 'BLOCKING',
              blockingFindingsCount: 1,
              advisoryFindingsCount: 0,
              policyDecisionRationale: 'The cited assertion is tautological.',
            },
            findings: [
              {
                id: 'TAUTOLOGY-001',
                title: 'Tautological assertion',
                category: 'tautology',
                proposedSeverity: 'BLOCKING',
                severity: 'BLOCKING',
                confidence: 'HIGH',
                description: 'The assertion cannot observe production behavior.',
                citations: { productionFiles: [], testFiles: [citation] },
                policyRule: 'High-confidence blockers require remediation.',
                failureScenario: 'A regression leaves the assertion passing.',
                impact: 'The regression can merge undetected.',
                remediation: ['Assert production behavior.'],
                verificationGuidance: 'Replace the literal assertion.',
              },
            ],
          }),
          promptTokens: 1,
          completionTokens: 1,
        }),
      },
      criticTransport: {
        complete: async () => {
          criticAttempts += 1;
          throw new ReviewerTransportError('MODEL_HTTP_503', 'Unavailable', true);
        },
      },
    });
    const result = await reviewer.review({
      schemaVersion: '1.0.0',
      collectorVersion: '1.0.0',
      status: 'READY',
      attribution: {
        repository: 'jdylanmc/game-hub',
        issueNumber: 58,
        pullRequestNumber: 63,
        baseSha: 'b'.repeat(40),
        headSha: 'a'.repeat(40),
        workflowRunId: 1,
        workflowRunAttempt: 1,
      },
      changes: { production: [], tests: [], other: [] },
    });

    expect(criticAttempts).toBe(3);
    expect(result.verdict).toMatchObject({ decision: 'FAIL', kind: 'POLICY' });
    expect(result.findings[0].critic).toMatchObject({ decision: 'INCONCLUSIVE', citations: { testFiles: [citation] } });
  });
});
