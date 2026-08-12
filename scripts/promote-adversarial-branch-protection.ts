#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface BranchProtection {
  requiredChecks: string[];
  strict: boolean;
}

interface BranchProtectionTransport {
  getAuthenticatedLogin(): Promise<string>;
  getBranchProtection(repository: string, branch: string): Promise<BranchProtection>;
  updateBranchProtection(repository: string, branch: string, protection: BranchProtection): Promise<void>;
}

function exact(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function sameProtection(left: BranchProtection, right: BranchProtection): boolean {
  return left.strict === right.strict && JSON.stringify(left.requiredChecks) === JSON.stringify(right.requiredChecks);
}

function validateProtection(value: BranchProtection, field: string): void {
  if (
    !value ||
    typeof value.strict !== 'boolean' ||
    !Array.isArray(value.requiredChecks) ||
    value.requiredChecks.length === 0 ||
    value.requiredChecks.some((check) => typeof check !== 'string' || check.length === 0) ||
    new Set(value.requiredChecks).size !== value.requiredChecks.length
  ) {
    throw new Error(`${field} is malformed`);
  }
}

async function promoteAdversarialBranchProtection(options: {
  repository: string;
  branch: string;
  reviewer: { name: string; checkName: string; promoted: boolean };
  expectedOldProtection: BranchProtection;
  candidateProtection: BranchProtection;
  expectedOldPromotion: string[];
  candidatePromotion: string[];
  proof: {
    headSha: string;
    checkName: string;
    conclusion: 'success' | 'neutral' | 'failure';
    runFingerprint: string;
    artifactSha256: string;
  };
  expectedHeadSha: string;
  transport: BranchProtectionTransport;
  now: () => Date;
}): Promise<{
  applied: true;
  evidence: {
    version: '1.0.0';
    repository: string;
    branch: string;
    reviewer: string;
    headSha: string;
    oldRequiredChecks: string[];
    newRequiredChecks: string[];
    promotedReviewers: string[];
    proofRunFingerprint: string;
    proofArtifactSha256: string;
    appliedAt: string;
  };
}> {
  if (options.repository !== 'jdylanmc/game-hub' || options.branch !== 'main') {
    throw new Error('Promotion may target only jdylanmc/game-hub main');
  }
  if ((await options.transport.getAuthenticatedLogin()) !== 'jdylanmc') {
    throw new Error('Branch-protection promotion requires the repository owner process-local identity');
  }
  validateProtection(options.expectedOldProtection, 'Expected old protection');
  validateProtection(options.candidateProtection, 'Candidate protection');
  if (
    !options.candidateProtection.strict ||
    options.expectedOldProtection.strict !== options.candidateProtection.strict
  ) {
    throw new Error('Promotion may not weaken strict branch protection');
  }
  if (
    !options.expectedOldProtection.requiredChecks.every(
      (check, index) => options.candidateProtection.requiredChecks[index] === check,
    ) ||
    options.candidateProtection.requiredChecks.length !== options.expectedOldProtection.requiredChecks.length + 1 ||
    options.candidateProtection.requiredChecks.at(-1) !== options.reviewer.checkName
  ) {
    throw new Error('Promotion must add exactly one new required check without removing or renaming existing checks');
  }
  if (
    !Array.isArray(options.expectedOldPromotion) ||
    !Array.isArray(options.candidatePromotion) ||
    new Set(options.expectedOldPromotion).size !== options.expectedOldPromotion.length ||
    new Set(options.candidatePromotion).size !== options.candidatePromotion.length ||
    !options.expectedOldPromotion.every((reviewer, index) => options.candidatePromotion[index] === reviewer) ||
    options.candidatePromotion.length !== options.expectedOldPromotion.length + 1 ||
    options.candidatePromotion.at(-1) !== options.reviewer.name ||
    options.reviewer.promoted
  ) {
    throw new Error('Promotion state must be one additive reviewer transition');
  }
  if (
    !exact(options.proof.headSha) ||
    options.proof.headSha !== options.expectedHeadSha ||
    options.proof.checkName !== options.reviewer.checkName ||
    options.proof.conclusion !== 'success' ||
    !digest(options.proof.runFingerprint) ||
    !digest(options.proof.artifactSha256)
  ) {
    throw new Error('Promotion requires an exact-head PASS proof with retained evidence digests');
  }
  const live = await options.transport.getBranchProtection(options.repository, options.branch);
  if (!sameProtection(live, options.expectedOldProtection)) {
    throw new Error('Live branch protection drifted from the expected compare-and-swap state');
  }
  await options.transport.updateBranchProtection(options.repository, options.branch, options.candidateProtection);
  const converged = await options.transport.getBranchProtection(options.repository, options.branch);
  if (!sameProtection(converged, options.candidateProtection)) {
    throw new Error('Branch protection did not converge after additive promotion; do not roll it back');
  }
  return {
    applied: true,
    evidence: {
      version: '1.0.0',
      repository: options.repository,
      branch: options.branch,
      reviewer: options.reviewer.name,
      headSha: options.proof.headSha,
      oldRequiredChecks: options.expectedOldProtection.requiredChecks,
      newRequiredChecks: options.candidateProtection.requiredChecks,
      promotedReviewers: options.candidatePromotion,
      proofRunFingerprint: options.proof.runFingerprint,
      proofArtifactSha256: options.proof.artifactSha256,
      appliedAt: options.now().toISOString(),
    },
  };
}

class GitHubBranchProtectionTransport implements BranchProtectionTransport {
  private readonly token: string;
  private rawProtection: Record<string, unknown> | undefined;

  constructor(token: string) {
    if (!token.trim()) throw new Error('GH_TOKEN must be supplied process-locally for branch-protection promotion');
    this.token = token;
  }

  private async request(method: string, url: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub branch-protection request failed with HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('GitHub branch-protection response is malformed');
    }
    return value as Record<string, unknown>;
  }

  async getAuthenticatedLogin(): Promise<string> {
    const user = await this.request('GET', 'https://api.github.com/user');
    return typeof user.login === 'string' ? user.login : '';
  }

  async getBranchProtection(repository: string, branch: string): Promise<BranchProtection> {
    const raw = await this.request(
      'GET',
      `https://api.github.com/repos/${encodeURIComponent(repository.split('/')[0])}/${encodeURIComponent(
        repository.split('/')[1],
      )}/branches/${encodeURIComponent(branch)}/protection`,
    );
    this.rawProtection = raw;
    const checks = raw.required_status_checks;
    if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
      throw new Error('GitHub required status checks are missing');
    }
    const contexts = (checks as Record<string, unknown>).contexts;
    return {
      requiredChecks: Array.isArray(contexts) ? contexts.map(String) : [],
      strict: (checks as Record<string, unknown>).strict === true,
    };
  }

  async updateBranchProtection(repository: string, branch: string, protection: BranchProtection): Promise<void> {
    if (!this.rawProtection) throw new Error('Branch protection must be read before compare-and-swap update');
    const raw = this.rawProtection;
    await this.request(
      'PUT',
      `https://api.github.com/repos/${encodeURIComponent(repository.split('/')[0])}/${encodeURIComponent(
        repository.split('/')[1],
      )}/branches/${encodeURIComponent(branch)}/protection`,
      {
        required_status_checks: { strict: protection.strict, contexts: protection.requiredChecks },
        enforce_admins: raw.enforce_admins,
        required_pull_request_reviews: raw.required_pull_request_reviews,
        restrictions: raw.restrictions,
        required_linear_history: raw.required_linear_history,
        allow_force_pushes: raw.allow_force_pushes,
        allow_deletions: raw.allow_deletions,
        required_conversation_resolution: raw.required_conversation_resolution,
        lock_branch: raw.lock_branch,
        allow_fork_syncing: raw.allow_fork_syncing,
      },
    );
  }
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: promote-adversarial-branch-protection.ts <reviewed-input.json>');
  const value: unknown = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Promotion input must be an object');
  const inputValue = value as Record<string, unknown>;
  const result = await promoteAdversarialBranchProtection({
    repository: typeof inputValue.repository === 'string' ? inputValue.repository : '',
    branch: typeof inputValue.branch === 'string' ? inputValue.branch : '',
    reviewer: inputValue.reviewer as { name: string; checkName: string; promoted: boolean },
    expectedOldProtection: inputValue.expectedOldProtection as BranchProtection,
    candidateProtection: inputValue.candidateProtection as BranchProtection,
    expectedOldPromotion: inputValue.expectedOldPromotion as string[],
    candidatePromotion: inputValue.candidatePromotion as string[],
    proof: inputValue.proof as {
      headSha: string;
      checkName: string;
      conclusion: 'success' | 'neutral' | 'failure';
      runFingerprint: string;
      artifactSha256: string;
    },
    expectedHeadSha: typeof inputValue.expectedHeadSha === 'string' ? inputValue.expectedHeadSha : '',
    transport: new GitHubBranchProtectionTransport(process.env.GH_TOKEN ?? ''),
    now: () => new Date(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}

export { promoteAdversarialBranchProtection };
export { GitHubBranchProtectionTransport };
export type { BranchProtection, BranchProtectionTransport };
