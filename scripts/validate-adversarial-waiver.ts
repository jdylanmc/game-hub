#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : undefined;
}

function parseWaiver(body: unknown): JsonObject | undefined {
  if (typeof body !== 'string') return undefined;
  const match = body.match(/^<!-- adversarial-waiver:([A-Za-z0-9_-]+) -->$/);
  if (!match) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function validateAdversarialWaiver(options: {
  repository: string;
  pullRequestNumber: number;
  headSha: string;
  reviewer: string;
  reviewerResult: unknown;
  comments: unknown[];
  authorizedOwners: string[];
  now: Date;
  purpose: 'merge' | 'promotion';
}): { valid: boolean; reasons: string[]; waiver?: JsonObject } {
  const reasons: string[] = [];
  if (
    options.purpose !== 'merge' ||
    !isSha(options.headSha) ||
    !Number.isInteger(options.pullRequestNumber) ||
    options.pullRequestNumber < 1 ||
    !Array.isArray(options.authorizedOwners) ||
    options.authorizedOwners.length === 0
  ) {
    reasons.push('Waiver request identity or purpose is invalid.');
  }
  const result = isObject(options.reviewerResult) && isObject(options.reviewerResult.verdict)
    ? options.reviewerResult.verdict
    : undefined;
  if (result?.decision !== 'INCONCLUSIVE' || result.kind !== 'COMPUTE') {
    reasons.push('Waivers apply only to compute-only INCONCLUSIVE evidence.');
  }
  const candidates = options.comments
    .filter(isObject)
    .map((comment) => ({ comment, waiver: parseWaiver(comment.body) }))
    .filter((candidate): candidate is { comment: JsonObject; waiver: JsonObject } => candidate.waiver !== undefined);
  if (candidates.length !== 1) {
    reasons.push('Exactly one machine-readable waiver comment is required.');
    return { valid: false, reasons };
  }
  const { comment, waiver } = candidates[0];
  const required = [
    'version',
    'repository',
    'pullRequestNumber',
    'headSha',
    'reviewer',
    'outageEvidence',
    'rationale',
    'authorizer',
    'createdAt',
    'expiresAt',
  ];
  if (
    Object.keys(waiver).length !== required.length ||
    required.some((field) => !(field in waiver)) ||
    waiver.version !== '1.0.0' ||
    waiver.repository !== options.repository ||
    waiver.pullRequestNumber !== options.pullRequestNumber ||
    waiver.headSha !== options.headSha ||
    waiver.reviewer !== options.reviewer ||
    typeof waiver.outageEvidence !== 'string' ||
    waiver.outageEvidence.length < 12 ||
    typeof waiver.rationale !== 'string' ||
    waiver.rationale.length < 20 ||
    typeof waiver.authorizer !== 'string'
  ) {
    reasons.push('Waiver fields do not bind the exact reviewer and pull-request head.');
  }
  if (
    typeof comment.author !== 'string' ||
    comment.author !== waiver.authorizer ||
    !options.authorizedOwners.includes(comment.author)
  ) {
    reasons.push('Waiver author is not an authorized repository owner.');
  }
  if (comment.createdAt !== comment.updatedAt) {
    reasons.push('Waiver comments must be immutable and unedited.');
  }
  const created = timestamp(waiver.createdAt);
  const expires = timestamp(waiver.expiresAt);
  const commentCreated = timestamp(comment.createdAt);
  if (
    created === undefined ||
    expires === undefined ||
    commentCreated === undefined ||
    created !== commentCreated ||
    expires <= created ||
    expires - created > 24 * 60 * 60 * 1000 ||
    expires <= options.now.getTime()
  ) {
    reasons.push('Waiver chronology or maximum 24-hour lifetime is invalid.');
  }
  return reasons.length === 0 ? { valid: true, reasons, waiver } : { valid: false, reasons };
}

function main(): void {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: validate-adversarial-waiver.ts <input.json>');
  const value: unknown = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (!isObject(value)) throw new Error('Waiver input must be an object');
  const result = validateAdversarialWaiver({
    repository: String(value.repository ?? ''),
    pullRequestNumber: Number(value.pullRequestNumber),
    headSha: String(value.headSha ?? ''),
    reviewer: String(value.reviewer ?? ''),
    reviewerResult: value.reviewerResult,
    comments: Array.isArray(value.comments) ? value.comments : [],
    authorizedOwners: Array.isArray(value.authorizedOwners) ? value.authorizedOwners.map(String) : [],
    now: new Date(),
    purpose: value.purpose === 'promotion' ? 'promotion' : 'merge',
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

export { validateAdversarialWaiver };
