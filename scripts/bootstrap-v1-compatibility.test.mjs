import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AdversarialReviewerEngine } from './review-adversarial-context.ts';
import { publishAdversarialEvidence } from './publish-adversarial-evidence.ts';
import { AdversarialFindingValidator } from './validate-adversarial-finding.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repoRoot, '.test-artifacts', 'bootstrap-v1');
const headSha = 'a'.repeat(40);

class CheckTransport {
  records = [];

  async listCheckRuns() {
    return this.records;
  }

  async createCheckRun(_repository, request) {
    const record = {
      id: 1,
      name: request.name,
      headSha: request.head_sha,
      externalId: request.external_id,
    };
    this.records.push(record);
    return record;
  }

  async updateCheckRun(_repository, _id, request) {
    return {
      ...this.records[0],
      name: request.name,
      externalId: request.external_id,
    };
  }
}

afterEach(async () => {
  await fs.rm(outputDirectory, { recursive: true, force: true });
});

describe('v1 bootstrap compatibility', () => {
  it('keeps the existing reviewer and exact-head unit-test check operational during the follow-up activation boundary', async () => {
    const workflow = await fs.readFile(path.join(repoRoot, '.github/workflows/adversarial-review.yml'), 'utf8');
    expect(workflow).toContain('yarn review:adversarial');
    expect(workflow).toContain('yarn publish:adversarial');
    expect(workflow).not.toContain('shared-v2');

    const reviewer = new AdversarialReviewerEngine({
      repoRoot,
      endpoint: 'https://fixture.openai.azure.com',
      deploymentId: 'game-hub-unit-test-reviewer',
      transport: {
        complete: async () => ({
          content: JSON.stringify({
            schemaVersion: '1.0.0',
            findingVersion: 'ignored@2026-08-12T00:00:00Z',
            attribution: {},
            verdict: {
              decision: 'PASS',
              severity: 'INFO',
              blockingFindingsCount: 0,
              advisoryFindingsCount: 0,
              policyDecisionRationale: 'The named test scenario is covered.',
            },
            findings: [],
          }),
          promptTokens: 100,
          completionTokens: 10,
        }),
      },
      clock: {
        now: () => Date.parse('2026-08-12T00:00:00Z'),
        sleep: async () => {},
      },
    });
    const result = await reviewer.review({
      schemaVersion: '1.0.0',
      collectorVersion: '1.0.0',
      status: 'READY',
      attribution: {
        repository: 'jdylanmc/game-hub',
        issueNumber: 56,
        pullRequestNumber: 57,
        baseSha: 'b'.repeat(40),
        headSha,
        inputSha256: 'c'.repeat(64),
        configVersion: '1.0.0',
        configSha256: 'd'.repeat(64),
      },
      trustBoundary: {
        classification: 'UNTRUSTED_DATA_ONLY',
        executableContentAllowed: false,
        instructionsFromEvidenceAllowed: false,
      },
      changes: { production: [], tests: [], other: [] },
      repositoryContext: {
        compatibilityBoundary: 'Follow-up issue 58 owns the explicit v2 activation.',
      },
    });

    expect(result.schemaVersion).toBe('1.0.0');
    expect(new AdversarialFindingValidator(repoRoot).validate(result).valid).toBe(true);
    const publication = await publishAdversarialEvidence({
      repoRoot,
      repository: 'jdylanmc/game-hub',
      issueNumber: 56,
      pullRequestNumber: 57,
      headSha,
      result,
      calibration: {
        reportSha256: 'e'.repeat(64),
        fingerprintSha256: 'f'.repeat(64),
        policyVersion: '1.0.0',
        calibratedAt: '2026-08-12T00:00:00.000Z',
      },
      outputDirectory,
      transport: new CheckTransport(),
      now: () => new Date('2026-08-12T00:00:01.000Z'),
    });

    expect(publication).toMatchObject({
      checkName: 'Adversarial Review / unit-test-reviewer',
      conclusion: 'success',
      created: true,
    });
  });
});
