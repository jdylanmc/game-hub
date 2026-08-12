#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgentRegistry } from './validate-adversarial-agent-registry.ts';

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main(): Promise<void> {
  const [repository, headSha] = process.argv.slice(2);
  const token = process.env.GITHUB_TOKEN;
  if (
    !repository ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !/^[a-f0-9]{40}$/.test(headSha) ||
    !token
  ) {
    throw new Error('Usage: GITHUB_TOKEN=... publish-adversarial-fan-in.ts <owner/repository> <head-sha>');
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry: unknown = JSON.parse(
    fs.readFileSync(path.join(root, 'config/adversarial-agents/agents-config.json'), 'utf8'),
  );
  const validation = validateAgentRegistry(root, registry);
  if (!validation.valid) throw new Error(`Invalid reviewer registry: ${validation.errors.join(' ')}`);
  const enabled = validation.agents.filter((agent) => agent.enabled);
  const [owner, repo] = repository.split('/');
  const request = async (method: string, url: string, body?: unknown): Promise<Record<string, unknown>> => {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub Checks API failed with HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('GitHub Checks API returned malformed JSON');
    return value as Record<string, unknown>;
  };
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${headSha}/check-runs?filter=latest&per_page=100`;
  const listed = await request('GET', url);
  const runs = Array.isArray(listed.check_runs) ? listed.check_runs : [];
  let conclusion: 'success' | 'neutral' | 'failure' = 'success';
  const missing: string[] = [];
  for (const agent of enabled) {
    const matches = runs.filter(
      (run) => run && typeof run === 'object' && (run as Record<string, unknown>).name === agent.checkName,
    ) as Array<Record<string, unknown>>;
    if (matches.length !== 1) {
      missing.push(agent.checkName);
      continue;
    }
    const run = matches[0];
    if (run.status !== 'completed' || !['success', 'neutral'].includes(String(run.conclusion))) {
      conclusion = 'failure';
    } else if (run.conclusion === 'neutral' && conclusion === 'success') {
      conclusion = 'neutral';
    }
  }
  if (missing.length > 0) conclusion = 'failure';
  const checkName = 'Adversarial Review / fan-in';
  const externalId = hash(`fan-in\n${repository}\n${headSha}`);
  const payload = {
    name: checkName,
    head_sha: headSha,
    external_id: externalId,
    status: 'completed',
    conclusion,
    output: {
      title: conclusion === 'failure' ? 'Adversarial fan-in is incomplete' : 'Adversarial fan-in completed',
      summary:
        conclusion === 'failure'
          ? `Missing, duplicate, stale, or failed reviewer checks: ${missing.join(', ') || 'see reviewer evidence'}.`
          : `Validated ${enabled.length} independently attributable exact-head reviewer check(s).`,
    },
  };
  const existing = runs.filter(
    (run) => run && typeof run === 'object' && (run as Record<string, unknown>).name === checkName,
  ) as Array<Record<string, unknown>>;
  if (existing.length > 1) throw new Error('Multiple fan-in checks already exist for this exact head');
  if (existing.length === 1) {
    await request(
      'PATCH',
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs/${String(existing[0].id)}`,
      payload,
    );
  } else {
    await request(
      'POST',
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs`,
      payload,
    );
  }
  process.stdout.write(`${JSON.stringify({ conclusion, enabledReviewers: enabled.map((agent) => agent.name) })}\n`);
  process.exitCode = conclusion === 'failure' ? 3 : 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
