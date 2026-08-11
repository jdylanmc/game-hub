import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodeMetadata,
  findingFingerprint,
  publishAdversarialEvidence,
  validateEvidenceManifest,
} from './publish-adversarial-evidence.ts';
import { exceptionIntegrity } from './apply-adversarial-exceptions.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repoRoot, '.test-artifacts', 'adversarial-publisher');
const headSha = 'a'.repeat(40);
const repository = 'jdylanmc/game-hub';
const publishedAt = new Date('2026-08-11T20:00:00.000Z');
const calibration = {
  reportSha256: 'b'.repeat(64),
  fingerprintSha256: 'c'.repeat(64),
  policyVersion: '1.0.0',
  calibratedAt: '2026-08-11T19:00:00.000Z',
};

function finding({
  id = 'TAUTOLOGY-1',
  title = 'Assertion cannot fail',
  severity = 'BLOCKING',
  confidence = 'HIGH',
  path: citationPath = 'src/example.test.ts',
  startLine = 4,
  description = 'The assertion is independent of production behavior.',
} = {}) {
  return {
    id,
    title,
    category: 'tautology',
    severity,
    confidence,
    description,
    citations: {
      productionFiles: [],
      testFiles: [
        {
          path: citationPath,
          startLine,
          endLine: startLine,
          snippet: 'expect(true).toBe(true);',
        },
      ],
    },
    missingScenario: 'A production regression must make the test fail.',
    expectedFailureSignal: 'The assertion fails when production output changes.',
    suggestedTest: 'Assert the result returned by the production function.',
  };
}

function reviewResult(findings = [], overrides = {}) {
  const blockingCount = findings.filter((item) => item.severity === 'BLOCKING' && item.confidence === 'HIGH').length;
  const advisoryCount = findings.length - blockingCount;
  const decision = blockingCount > 0 ? 'FAIL' : 'PASS';
  const severity = blockingCount > 0 ? 'BLOCKING' : advisoryCount > 0 ? 'ADVISORY' : 'INFO';
  return {
    schemaVersion: '1.0.0',
    findingVersion: 'unit-test-reviewer@2026-08-11T19:30:00Z',
    attribution: {
      agentName: 'unit-test-reviewer',
      agentVersion: '1.0.0',
      modelDeployment: 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard',
      promptVersion: '1.0.3',
      promptContentHash: '9d5667c8233da813b06adc93eba7daf832339653b44c617a006df51b21697c68',
      policyVersion: '1.0.0',
      toolsVersion: '1.0.0',
      subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
      repositoryCommit: headSha,
      timestamp: '2026-08-11T19:30:00Z',
    },
    verdict: {
      decision,
      severity,
      blockingFindingsCount: blockingCount,
      advisoryFindingsCount: advisoryCount,
      policyDecisionRationale:
        blockingCount > 0
          ? `${blockingCount} validated high-confidence blocking finding(s) meet policy.`
          : 'No validated high-confidence blocking findings meet policy.',
    },
    findings,
    summary: {
      pullRequestNumber: 35,
      pullRequestCommit: headSha,
      reviewDurationMs: 1234,
      tokensUsed: 1500,
      estimatedCost: 0.0012,
      contextCollectionStatus: 'complete',
      contextLimitations: [],
    },
    ...overrides,
  };
}

class FakeGitHubTransport {
  records = [];
  listCalls = [];
  createCalls = [];
  updateCalls = [];
  fail = undefined;
  returnedHeadSha = undefined;
  nextId = 100;

  async listCheckRuns(targetRepository, targetHeadSha, checkName) {
    this.listCalls.push({ repository: targetRepository, headSha: targetHeadSha, checkName });
    if (this.fail === 'list') throw new Error('simulated list failure');
    return this.records.filter((record) => record.headSha === targetHeadSha && record.name === checkName);
  }

  async createCheckRun(targetRepository, request) {
    this.createCalls.push({ repository: targetRepository, request: structuredClone(request) });
    if (this.fail === 'create') throw new Error('simulated create failure');
    const record = {
      id: this.nextId++,
      name: request.name,
      headSha: this.returnedHeadSha ?? request.head_sha,
      externalId: request.external_id,
      metadata: decodeMetadata(request.output.text),
    };
    this.records.push(record);
    return record;
  }

  async updateCheckRun(targetRepository, checkRunId, request) {
    this.updateCalls.push({
      repository: targetRepository,
      checkRunId,
      request: structuredClone(request),
    });
    if (this.fail === 'update') throw new Error('simulated update failure');
    const record = this.records.find((candidate) => candidate.id === checkRunId);
    if (!record) throw new Error('missing fake check run');
    record.metadata = decodeMetadata(request.output.text);
    return { ...record };
  }
}

function options(transport, result = reviewResult([finding()]), outputName = 'default') {
  return {
    repoRoot,
    repository,
    issueNumber: 30,
    headSha,
    result,
    calibration,
    outputDirectory: path.join(outputRoot, outputName),
    transport,
    now: () => publishedAt,
  };
}

function exceptionBundle(result) {
  const unsigned = {
    exceptionVersion: '1.0.0',
    exceptionId: 'EXC-20260811-ABC123',
    owner: { githubLogin: 'owner-user' },
    rationale: 'A bounded follow-up is tracked while this exact finding remains visible.',
    issue: { repository, number: 30, url: 'https://github.com/jdylanmc/game-hub/issues/30' },
    createdAt: '2026-08-11T19:35:00.000Z',
    expiresAt: '2026-08-18T19:40:00.000Z',
    affected: {
      agentName: 'unit-test-reviewer',
      agentVersion: '1.0.0',
      repository,
      headSha,
      runFingerprint: exceptionIntegrity(result),
      findingFingerprint: findingFingerprint(result.findings[0]),
    },
    auditEvidence: {
      approvedBy: 'approver-user',
      approvedAt: '2026-08-11T19:40:00.000Z',
      approvalUrl: 'https://github.com/jdylanmc/game-hub/issues/30#issuecomment-123456789',
      approvalRecordSha256: 'b'.repeat(64),
    },
  };
  return {
    version: '1.0.0',
    maximumValidityHours: 168,
    maximumExceptionsPerRun: 3,
    exceptions: [{ ...unsigned, integritySha256: exceptionIntegrity(unsigned) }],
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

beforeEach(async () => {
  await fs.rm(outputRoot, { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(outputRoot, { recursive: true, force: true });
});

describe('publishAdversarialEvidence', () => {
  it('publishes an exact exception as a warning and neutral check while retaining immutable audit evidence', async () => {
    const transport = new FakeGitHubTransport();
    const result = reviewResult([finding()]);
    const publication = await publishAdversarialEvidence({
      ...options(transport, result, 'exception'),
      exceptionBundle: exceptionBundle(result),
    });
    const artifact = await readJson(publication.artifactPath);

    expect(publication.conclusion).toBe('neutral');
    expect(transport.createCalls[0].request.output.annotations[0].annotation_level).toBe('warning');
    expect(artifact.result).toEqual(result);
    expect(artifact.exceptions.applications).toHaveLength(1);
    expect(artifact.exceptions.unexceptedBlockingFindingFingerprints).toEqual([]);
    expect((await validateEvidenceManifest(repoRoot, publication.manifestPath)).valid).toBe(true);
  });

  it('creates and then updates exactly one check run for the agent and head SHA', async () => {
    const transport = new FakeGitHubTransport();
    const first = await publishAdversarialEvidence(options(transport));
    const second = await publishAdversarialEvidence(options(transport));

    expect(first).toMatchObject({ created: true, conclusion: 'failure', annotationCount: 1 });
    expect(second).toMatchObject({
      created: false,
      checkRunId: first.checkRunId,
      annotationCount: 0,
      runFingerprint: first.runFingerprint,
    });
    expect(transport.records).toHaveLength(1);
    expect(transport.createCalls).toHaveLength(1);
    expect(transport.updateCalls).toHaveLength(1);
    expect(transport.createCalls[0].request.head_sha).toBe(headSha);
    expect(transport.updateCalls[0].request.output.annotations).toBeUndefined();
  });

  it('batches annotations at the GitHub maximum of 50 per request', async () => {
    const transport = new FakeGitHubTransport();
    const findings = Array.from({ length: 51 }, (_, index) =>
      finding({
        id: `TAUTOLOGY-${index + 1}`,
        title: `Finding ${index + 1}`,
        startLine: index + 1,
      }),
    );

    const publication = await publishAdversarialEvidence(options(transport, reviewResult(findings), 'batches'));

    expect(publication.annotationBatchSizes).toEqual([50, 1]);
    expect(transport.createCalls[0].request.output.annotations).toHaveLength(50);
    expect(transport.updateCalls[0].request.output.annotations).toHaveLength(1);
    expect(
      [...transport.createCalls, ...transport.updateCalls].every(
        (call) => (call.request.output.annotations?.length ?? 0) <= 50,
      ),
    ).toBe(true);
  });

  it.each([
    ['an absolute path', { path: '/etc/passwd' }],
    ['a traversing path', { path: '../src/example.test.ts' }],
    ['a backwards line range', { startLine: 0 }],
  ])('rejects %s before publishing', async (_label, findingOverride) => {
    const transport = new FakeGitHubTransport();
    await expect(
      publishAdversarialEvidence(options(transport, reviewResult([finding(findingOverride)]), 'invalid-citation')),
    ).rejects.toThrow(/invalid|citation|annotation/i);
    expect(transport.listCalls).toHaveLength(0);
    expect(transport.createCalls).toHaveLength(0);
  });

  it('maps advisory findings to neutral warnings and blocking findings to failures', async () => {
    const advisoryTransport = new FakeGitHubTransport();
    const advisory = finding({ severity: 'ADVISORY', confidence: 'MEDIUM' });
    const advisoryPublication = await publishAdversarialEvidence(
      options(advisoryTransport, reviewResult([advisory]), 'advisory'),
    );
    expect(advisoryPublication.conclusion).toBe('neutral');
    expect(advisoryTransport.createCalls[0].request.output.annotations[0].annotation_level).toBe('warning');

    const blockingTransport = new FakeGitHubTransport();
    const blockingPublication = await publishAdversarialEvidence(
      options(blockingTransport, reviewResult([finding()]), 'blocking'),
    );
    expect(blockingPublication.conclusion).toBe('failure');
    expect(blockingTransport.createCalls[0].request.output.annotations[0].annotation_level).toBe('failure');
  });

  it('rejects stale reviewer and GitHub check head SHAs', async () => {
    const staleResultTransport = new FakeGitHubTransport();
    const staleResult = reviewResult([finding()]);
    staleResult.attribution.repositoryCommit = 'd'.repeat(40);
    staleResult.summary.pullRequestCommit = 'd'.repeat(40);
    await expect(
      publishAdversarialEvidence(options(staleResultTransport, staleResult, 'stale-result')),
    ).rejects.toThrow(/head SHA/);
    expect(staleResultTransport.listCalls).toHaveLength(0);

    const staleCheckTransport = new FakeGitHubTransport();
    staleCheckTransport.records.push({
      id: 9,
      name: 'Adversarial Review / unit-test-reviewer',
      headSha,
      externalId: null,
    });
    await expect(
      publishAdversarialEvidence(options(staleCheckTransport, reviewResult([finding()]), 'stale-check')),
    ).rejects.toThrow(/attribution/);

    const staleResponseTransport = new FakeGitHubTransport();
    staleResponseTransport.returnedHeadSha = 'e'.repeat(40);
    await expect(
      publishAdversarialEvidence(options(staleResponseTransport, reviewResult([finding()]), 'stale-response')),
    ).rejects.toThrow(/stale/);
  });

  it('deduplicates repeated findings by stable content fingerprint', async () => {
    const transport = new FakeGitHubTransport();
    const duplicate = finding({ id: 'TAUTOLOGY-2' });
    const publication = await publishAdversarialEvidence(
      options(transport, reviewResult([finding(), duplicate]), 'duplicates'),
    );

    expect(publication.findingFingerprints).toHaveLength(1);
    expect(publication.annotationCount).toBe(1);
    expect(transport.createCalls[0].request.output.annotations).toHaveLength(1);
  });

  it('updates supersession metadata and publishes only novel finding annotations', async () => {
    const transport = new FakeGitHubTransport();
    const first = await publishAdversarialEvidence(options(transport, reviewResult([finding()]), 'superseded'));
    const replacement = finding({
      id: 'TAUTOLOGY-2',
      title: 'A different weak assertion',
      startLine: 9,
    });
    const second = await publishAdversarialEvidence(options(transport, reviewResult([replacement]), 'superseded'));

    expect(second.supersedesRunFingerprint).toBe(first.runFingerprint);
    expect(second.supersededFindingFingerprints).toEqual(first.findingFingerprints);
    expect(second.annotationCount).toBe(1);
    expect(transport.records).toHaveLength(1);
    const manifest = await readJson(second.manifestPath);
    expect(manifest).toMatchObject({
      supersedesRunFingerprint: first.runFingerprint,
      supersededFindingFingerprints: first.findingFingerprints,
    });
  });

  it('redacts sensitive strings while retaining complete validated evidence and attribution', async () => {
    const transport = new FakeGitHubTransport();
    const token = `ghp_${'Z'.repeat(36)}`;
    const sensitiveFinding = finding({ description: `Leaked token ${token}` });
    const publication = await publishAdversarialEvidence(
      options(transport, reviewResult([sensitiveFinding]), 'redaction'),
    );
    const artifactText = await fs.readFile(publication.artifactPath, 'utf8');
    const artifact = JSON.parse(artifactText);
    const manifest = await readJson(publication.manifestPath);

    expect(artifactText).not.toContain(token);
    expect(JSON.stringify(transport.createCalls)).not.toContain(token);
    expect(artifactText).toContain('[REDACTED:SENSITIVE_CONTENT]');
    expect(artifact.retention).toMatchObject({
      days: 90,
      containsSensitiveContent: false,
      redactionCount: 1,
    });
    expect(artifact.attribution).toMatchObject({
      issueNumber: 30,
      pullRequestNumber: 35,
      repository,
      headSha,
      modelDeployment: 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard',
      promptVersion: '1.0.3',
      promptContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      schemaVersion: '1.0.0',
      policyVersion: '1.0.0',
      toolsVersion: '1.0.0',
      calibration,
      reviewedAt: '2026-08-11T19:30:00Z',
      publishedAt: publishedAt.toISOString(),
      tokensUsed: 1500,
      estimatedCostUsd: 0.0012,
      latencyMs: 1234,
      supersedesRunFingerprint: null,
    });
    expect(manifest.retention).toEqual(artifact.retention);
    await expect(validateEvidenceManifest(repoRoot, publication.manifestPath)).resolves.toEqual({
      valid: true,
      reasons: [],
    });
  });

  it('detects missing and tampered retained evidence', async () => {
    const transport = new FakeGitHubTransport();
    await expect(publishAdversarialEvidence(options(transport, null, 'missing-output'))).rejects.toThrow(/missing/);
    expect(transport.listCalls).toHaveLength(0);

    const publication = await publishAdversarialEvidence(options(transport, reviewResult([finding()]), 'tampered'));
    await fs.appendFile(publication.artifactPath, '\n');
    await expect(validateEvidenceManifest(repoRoot, publication.manifestPath)).resolves.toMatchObject({
      valid: false,
      reasons: expect.arrayContaining(['Evidence artifact hash mismatch.']),
    });

    const manifest = await readJson(publication.manifestPath);
    manifest.headSha = 'f'.repeat(40);
    await fs.writeFile(publication.manifestPath, JSON.stringify(manifest));
    await expect(validateEvidenceManifest(repoRoot, publication.manifestPath)).resolves.toMatchObject({
      valid: false,
      reasons: expect.arrayContaining(['Evidence manifest attribution does not match its artifact.']),
    });
  });

  it.each(['list', 'create', 'update'])('fails closed when the GitHub %s API call fails', async (failure) => {
    const transport = new FakeGitHubTransport();
    if (failure === 'update') {
      await publishAdversarialEvidence(options(transport, reviewResult([finding()]), `api-${failure}`));
    }
    transport.fail = failure;

    await expect(
      publishAdversarialEvidence(
        options(
          transport,
          reviewResult([
            finding({
              id: 'TAUTOLOGY-3',
              title: failure === 'update' ? 'Changed finding' : 'Assertion cannot fail',
            }),
          ]),
          `api-${failure}`,
        ),
      ),
    ).rejects.toThrow(/simulated/);
  });

  it('rejects multiple existing check runs instead of publishing another duplicate', async () => {
    const transport = new FakeGitHubTransport();
    await publishAdversarialEvidence(options(transport, reviewResult([finding()]), 'multiple'));
    transport.records.push({ ...transport.records[0], id: 999 });

    await expect(publishAdversarialEvidence(options(transport, reviewResult([finding()]), 'multiple'))).rejects.toThrow(
      /Multiple check runs/,
    );
    expect(transport.createCalls).toHaveLength(1);
  });
});
