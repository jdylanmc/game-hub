#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdversarialFindingValidator } from './validate-adversarial-finding.ts';
import { validateAgentRegistry } from './validate-adversarial-agent-registry.ts';

type JsonObject = Record<string, unknown>;

interface FanInEvidence {
  agentName: string;
  check: {
    name: string;
    headSha: string;
    conclusion: 'success' | 'neutral' | 'failure';
    provenance: {
      runFingerprint: string;
      artifactSha256: string;
    };
  };
  manifest: {
    repository: string;
    headSha: string;
    agentName: string;
    checkName: string;
    artifactSha256: string;
  };
  result: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: unknown): value is boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function evaluateAdversarialFanIn(options: {
  repoRoot: string;
  headSha: string;
  enabledReviewers: string[];
  evidence: unknown[];
}): {
  valid: boolean;
  conclusion: 'success' | 'neutral' | 'failure';
  reasons: string[];
  legacyEvidence: string[];
} {
  const reasons: string[] = [];
  if (!/^[a-f0-9]{40}$/.test(options.headSha)) reasons.push('Fan-in head SHA is invalid.');
  if (
    !Array.isArray(options.enabledReviewers) ||
    options.enabledReviewers.length === 0 ||
    new Set(options.enabledReviewers).size !== options.enabledReviewers.length
  ) {
    reasons.push('Enabled reviewer set is invalid.');
  }
  const registryPath = path.join(options.repoRoot, 'config/adversarial-agents/agents-config.json');
  let registry: JsonObject | undefined;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (isObject(parsed)) registry = parsed;
  } catch {
    // Reported below.
  }
  const registration = registry ? validateAgentRegistry(options.repoRoot, registry) : undefined;
  if (!registration?.valid) reasons.push('Reviewer registry is invalid.');
  const expected = new Map(
    (registration?.agents ?? [])
      .filter((agent) => options.enabledReviewers.includes(agent.name) && agent.enabled)
      .map((agent) => [agent.name, agent]),
  );
  if (expected.size !== options.enabledReviewers.length)
    reasons.push('Enabled reviewer state does not match the registry.');

  const entries = options.evidence.filter(isObject) as unknown as FanInEvidence[];
  if (entries.length !== options.evidence.length) reasons.push('Fan-in evidence is malformed.');
  const seen = new Set<string>();
  const legacyEvidence: string[] = [];
  let inconclusive = false;
  for (const entry of entries) {
    if (!entry || typeof entry.agentName !== 'string' || seen.has(entry.agentName)) {
      reasons.push('Reviewer evidence is missing or duplicated.');
      continue;
    }
    seen.add(entry.agentName);
    const agent = expected.get(entry.agentName);
    if (!agent) {
      reasons.push(`Unexpected or disabled reviewer evidence: ${entry.agentName}.`);
      continue;
    }
    const check = entry.check;
    const manifest = entry.manifest;
    if (
      !check ||
      check.name !== agent.checkName ||
      check.headSha !== options.headSha ||
      !['success', 'neutral', 'failure'].includes(check.conclusion) ||
      !check.provenance ||
      !sha256(check.provenance.runFingerprint) ||
      !sha256(check.provenance.artifactSha256)
    ) {
      reasons.push(`Check provenance is invalid for ${entry.agentName}.`);
      continue;
    }
    if (
      !manifest ||
      manifest.headSha !== options.headSha ||
      manifest.agentName !== entry.agentName ||
      manifest.checkName !== agent.checkName ||
      !sha256(manifest.artifactSha256) ||
      manifest.artifactSha256 !== check.provenance.artifactSha256
    ) {
      reasons.push(`Artifact manifest is invalid for ${entry.agentName}.`);
      continue;
    }
    const schemaVersion = isObject(entry.result) ? entry.result.schemaVersion : undefined;
    if (schemaVersion === '2.0.0') {
      reasons.push(`Reviewer v2 evidence is dormant until explicit activation: ${entry.agentName}.`);
      continue;
    }
    const validation = new AdversarialFindingValidator(options.repoRoot, entry.agentName).validate(entry.result);
    if (!validation.valid || !isObject(entry.result) || !isObject(entry.result.verdict)) {
      reasons.push(
        `Reviewer result is invalid for ${entry.agentName}: ${
          validation.errors.map((error) => error.field).join(', ') || 'missing verdict'
        }.`,
      );
      continue;
    }
    const verdict = entry.result.verdict;
    const legacy = schemaVersion === '1.0.0';
    const attribution = isObject(entry.result.attribution) ? entry.result.attribution : {};
    const summary = isObject(entry.result.summary) ? entry.result.summary : {};
    const resultHead = legacy
      ? attribution.repositoryCommit
      : isObject(entry.result.provenance)
        ? entry.result.provenance.headCommit
        : undefined;
    if (resultHead !== options.headSha) {
      reasons.push(`Reviewer result is stale for ${entry.agentName}.`);
      continue;
    }
    if (legacy && summary.pullRequestCommit !== undefined && summary.pullRequestCommit !== options.headSha) {
      reasons.push(`Legacy reviewer summary is stale for ${entry.agentName}.`);
      continue;
    }
    const expectedConclusion =
      verdict.decision === 'PASS' ? 'success' : !legacy && verdict.decision === 'INCONCLUSIVE' ? 'neutral' : 'failure';
    if (check.conclusion !== expectedConclusion || check.conclusion === 'failure') {
      reasons.push(`Reviewer conclusion is blocking or mismatched for ${entry.agentName}.`);
      continue;
    }
    if (legacy) legacyEvidence.push(entry.agentName);
    if (check.conclusion === 'neutral') inconclusive = true;
  }
  for (const name of options.enabledReviewers) {
    if (!seen.has(name)) reasons.push(`Missing reviewer evidence: ${name}.`);
  }
  return {
    valid: reasons.length === 0,
    conclusion: reasons.length > 0 ? 'failure' : inconclusive ? 'neutral' : 'success',
    reasons,
    legacyEvidence: [...new Set(legacyEvidence)].sort(),
  };
}

function main(): void {
  const [flag, inputPath] = process.argv.slice(2);
  if (flag !== '--input' || !inputPath) throw new Error('Usage: fan-in-adversarial-evidence.ts --input <json>');
  const value: unknown = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!isObject(value)) throw new Error('Fan-in input must be an object');
  const result = evaluateAdversarialFanIn({
    repoRoot: path.resolve(typeof value.repoRoot === 'string' ? value.repoRoot : '.'),
    headSha: typeof value.headSha === 'string' ? value.headSha : '',
    enabledReviewers: Array.isArray(value.enabledReviewers) ? value.enabledReviewers.map(String) : [],
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.valid ? 0 : 3;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

export { evaluateAdversarialFanIn };
export type { FanInEvidence };
