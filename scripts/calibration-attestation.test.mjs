import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildCalibrationAttestationPredicate,
  expectedReportFingerprintComponents,
  loadCalibrationAttestationPolicy,
  reportHash,
  validateVerifiedAttestation,
  verifyCalibrationAttestation,
} from './calibration-attestation.ts';
import { stableStringify } from './collect-adversarial-context.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = path.join(repoRoot, 'test-results', `calibration-attestation-${process.pid}`);
const reportPath = path.join(fixtureDirectory, 'calibration-report.json');
const bundlePath = path.join(fixtureDirectory, 'attestation-bundle.json');
const policy = loadCalibrationAttestationPolicy(repoRoot);
const attestedAt = '2026-08-12T06:10:00.000Z';
const verificationTime = '2026-08-12T06:15:00.000Z';

const context = {
  repoRoot,
  agentName: 'gilfoyle-security-architect',
  reportPath,
  bundlePath,
  artifactId: '987654321',
  artifactName: 'gilfoyle-calibration-31570000000-1',
  artifactDigest: 'b'.repeat(64),
  repository: 'jdylanmc/game-hub',
  repositoryId: '1330993568',
  repositoryOwnerId: '6954990',
  ref: 'refs/heads/main',
  headSha: 'a'.repeat(40),
  workflowName: 'Adversarial calibration',
  workflowPath: '.github/workflows/adversarial-calibration.yml',
  workflowRef: 'jdylanmc/game-hub/.github/workflows/adversarial-calibration.yml@refs/heads/main',
  workflowSha: 'a'.repeat(40),
  workflowStartedAt: '2026-08-12T05:00:00.000Z',
  runId: '31570000000',
  runAttempt: 1,
  eventName: 'workflow_dispatch',
  environment: 'adversarial-review',
  azureTenantId: '11111111-1111-4111-8111-111111111111',
  azureClientId: '22222222-2222-4222-8222-222222222222',
  azureResourceId: policy.azureDeployment.resourceId,
  azureEndpoint: policy.azureDeployment.endpoint,
  now: verificationTime,
};

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeReport() {
  const components = expectedReportFingerprintComponents(repoRoot, context.agentName);
  const report = {
    schemaVersion: '1.0.0',
    reportVersion: '1.0.0',
    agentName: 'gilfoyle-security-architect',
    corpusVersion: '1.0.0',
    promotionPolicyVersion: '1.0.0',
    runMode: 'azure',
    generatedAt: '2026-08-12T06:00:00.000Z',
    repetitionsPerCase: 2,
    complete: true,
    calibrationFingerprint: {
      components,
      sha256: digest(stableStringify(components)),
    },
    caseResults: [],
    metrics: {},
    reportSha256: '',
  };
  report.reportSha256 = reportHash(report);
  fs.writeFileSync(reportPath, `${stableStringify(report, 2)}\n`);
  fs.writeFileSync(bundlePath, '{}\n');
}

function fakeVerifiedResult() {
  const predicate = buildCalibrationAttestationPredicate({
    ...context,
    attestedAt,
  });
  return [
    {
      attestation: { bundle: { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json' } },
      verificationResult: {
        signature: {
          certificate: {
            certificateIssuer: 'CN=github.com,O=GitHub\\, Inc.,L=San Francisco,ST=California,C=US',
            subjectAlternativeName: policy.trustedBuilder.subjectAlternativeName,
            issuer: policy.trustedBuilder.oidcIssuer,
            buildSignerURI: policy.trustedBuilder.subjectAlternativeName,
            buildSignerDigest: context.workflowSha,
            runnerEnvironment: policy.trustedBuilder.runnerEnvironment,
            sourceRepositoryURI: 'https://github.com/jdylanmc/game-hub',
            sourceRepositoryDigest: context.headSha,
            sourceRepositoryRef: policy.repository.protectedRef,
            sourceRepositoryIdentifier: policy.repository.repositoryId,
            sourceRepositoryOwnerURI: 'https://github.com/jdylanmc',
            sourceRepositoryOwnerIdentifier: policy.repository.ownerId,
            buildConfigURI: policy.trustedBuilder.subjectAlternativeName,
            buildConfigDigest: context.workflowSha,
            buildTrigger: policy.trustedBuilder.event,
            runInvocationURI: 'https://github.com/jdylanmc/game-hub/actions/runs/31570000000/attempts/1',
            sourceRepositoryVisibilityAtSigning: policy.repository.visibility,
          },
        },
        verifiedTimestamps: [
          {
            type: 'Tlog',
            uri: 'https://rekor.sigstore.dev',
            timestamp: '2026-08-12T06:10:02.000Z',
          },
        ],
        statement: {
          _type: 'https://in-toto.io/Statement/v1',
          subject: [
            {
              name: 'calibration-report.json',
              digest: {
                sha256: digest(fs.readFileSync(reportPath)),
              },
            },
          ],
          predicateType: policy.predicateType,
          predicate,
        },
      },
    },
  ];
}

beforeAll(() => {
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  writeReport();
});

afterAll(() => {
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
});

describe('protected calibration predicate', () => {
  it('binds exact code, workload, Azure, benchmark, report, artifact, and freshness evidence', () => {
    const predicate = buildCalibrationAttestationPredicate({
      ...context,
      attestedAt,
    });

    expect(predicate.repository).toMatchObject({
      nameWithOwner: 'jdylanmc/game-hub',
      repositoryId: '1330993568',
      headSha: 'a'.repeat(40),
    });
    expect(predicate.workflow).toMatchObject({
      runId: '31570000000',
      runAttempt: 1,
      sha: 'a'.repeat(40),
      environment: 'adversarial-review',
    });
    expect(predicate.workloadIdentity).toMatchObject({
      subject: policy.trustedBuilder.workloadIdentitySubject,
      tenantId: context.azureTenantId,
      clientId: context.azureClientId,
    });
    expect(predicate.azureDeployment).toEqual(policy.azureDeployment);
    expect(predicate.agentConfiguration.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(predicate.benchmarkInputs).toMatchObject({
      version: '1.0.0',
      caseCount: 24,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(predicate.calibrationReport).toMatchObject({
      fileSha256: digest(fs.readFileSync(reportPath)),
      artifactSha256: 'b'.repeat(64),
    });
    expect(predicate.replayProtection).toEqual({
      strategy: 'exact-protected-run-and-artifact',
      nonceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    ['feature ref', { ref: 'refs/heads/feature' }],
    ['different workflow commit', { workflowSha: 'c'.repeat(40) }],
    ['untrusted environment', { environment: 'pull-request' }],
    ['different Azure deployment', { azureResourceId: '/subscriptions/other' }],
    ['different Azure endpoint', { azureEndpoint: 'https://example.invalid' }],
  ])('rejects %s before signing', (_name, override) => {
    expect(() =>
      buildCalibrationAttestationPredicate({
        ...context,
        ...override,
        attestedAt,
      }),
    ).toThrow();
  });
});

describe('calibration attestation verification', () => {
  it('invokes GitHub cryptographic verification with exact signer policy and accepts one fresh result', () => {
    const calls = [];
    const verified = fakeVerifiedResult();
    const result = verifyCalibrationAttestation(context, (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: JSON.stringify(verified) };
    });

    expect(result).toMatchObject({
      valid: true,
      attestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      verifiedAt: verificationTime,
    });
    expect(calls).toEqual([
      {
        command: 'gh',
        args: expect.arrayContaining([
          'attestation',
          'verify',
          reportPath,
          '--bundle',
          bundlePath,
          '--signer-workflow',
          policy.trustedBuilder.signerWorkflow,
          '--source-ref',
          'refs/heads/main',
          '--source-digest',
          context.headSha,
          '--signer-digest',
          context.workflowSha,
          '--deny-self-hosted-runners',
          '--no-public-good',
          '--predicate-type',
          policy.predicateType,
        ]),
      },
    ]);
  });

  it('fails closed when the bundle is unsigned, untrusted, or cryptographic verification fails', () => {
    expect(() =>
      verifyCalibrationAttestation(context, () => ({
        status: 1,
        stdout: '',
        stderr: 'untrusted',
      })),
    ).toThrow('Cryptographic GitHub attestation verification failed closed.');
  });

  it('rejects duplicate verified attestations as replay ambiguity', () => {
    const verified = fakeVerifiedResult();
    expect(() => validateVerifiedAttestation(context, [...verified, ...verified])).toThrow(
      'Exactly one verified attestation is required; duplicates and replay are rejected.',
    );
  });

  it.each([
    [
      'different protected head',
      (result) => (result[0].verificationResult.signature.certificate.sourceRepositoryDigest = 'c'.repeat(40)),
    ],
    [
      'replayed workflow run',
      (result) =>
        (result[0].verificationResult.signature.certificate.runInvocationURI =
          'https://github.com/jdylanmc/game-hub/actions/runs/1/attempts/1'),
    ],
    [
      'different Azure identity',
      (result) => (result[0].verificationResult.statement.predicate.azureDeployment.deploymentId = 'other'),
    ],
    [
      'different agent configuration',
      (result) => (result[0].verificationResult.statement.predicate.agentConfiguration.sha256 = 'c'.repeat(64)),
    ],
    [
      'different report subject',
      (result) => (result[0].verificationResult.statement.subject[0].digest.sha256 = 'c'.repeat(64)),
    ],
    ['missing verified timestamp', (result) => (result[0].verificationResult.verifiedTimestamps = [])],
    [
      'stale verified timestamp',
      (result) => (result[0].verificationResult.verifiedTimestamps[0].timestamp = '2026-08-12T04:00:00.000Z'),
    ],
  ])('rejects %s', (_name, mutate) => {
    const verified = structuredClone(fakeVerifiedResult());
    mutate(verified);
    expect(() => validateVerifiedAttestation(context, verified)).toThrow();
  });

  it('rejects a tampered report even if repository-authored hashes are refreshed incompletely', () => {
    const verified = fakeVerifiedResult();
    const original = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(original);
    report.metrics = { forged: true };
    fs.writeFileSync(reportPath, `${stableStringify(report, 2)}\n`);
    try {
      expect(() => validateVerifiedAttestation(context, verified)).toThrow();
    } finally {
      fs.writeFileSync(reportPath, original);
    }
  });

  it('rejects artifact or run expectations that do not match the signed predicate', () => {
    const verified = fakeVerifiedResult();
    expect(() =>
      validateVerifiedAttestation(
        {
          ...context,
          artifactDigest: 'd'.repeat(64),
        },
        verified,
      ),
    ).toThrow('Attestation predicate does not match the exact run, configuration, deployment, or artifact.');
  });
});
