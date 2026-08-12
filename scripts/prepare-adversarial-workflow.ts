#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from './collect-adversarial-context.ts';

type JsonObject = Record<string, unknown>;

interface WorkflowConfig {
  version: string;
  deterministicWorkflowName: string;
  deterministicWorkflowPath: string;
  trustedBaseBranch: string;
  maxConcurrentReviews: number;
  maxChangedFiles: number;
  relevantPaths: string[];
}

interface PullRequestMetadata {
  number: number;
  htmlUrl: string;
  title: string;
  body: string;
  state: string;
  author: string;
  baseSha: string;
  baseRef: string;
  baseRepository: string;
  headSha: string;
  headRef: string;
  headRepository: string;
}

interface IssueMetadata {
  number: number;
  htmlUrl: string;
  title: string;
  body: string;
}

interface GitHubMetadataTransport {
  getPullRequest(repository: string, number: number): Promise<PullRequestMetadata>;
  findOpenPullRequestsByHead(
    repository: string,
    headRepositoryOwner: string,
    headRef: string,
  ): Promise<PullRequestMetadata[]>;
  listPullRequestFiles(repository: string, number: number, maximum: number): Promise<string[]>;
  getIssue(repository: string, number: number): Promise<IssueMetadata>;
}

interface PreparedWorkflow {
  eligible: boolean;
  reason: string;
  repository: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  pullRequestNumber?: number;
  issueNumber?: number;
  baseSha?: string;
  headSha?: string;
  headRepository?: string;
  headRepositoryUrl?: string;
  capacitySlot?: number;
  collectorInput?: JsonObject;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(filePath: string): JsonObject {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(value)) throw new Error(`${filePath} must contain a JSON object`);
  return value;
}

function loadWorkflowConfig(repoRoot: string): WorkflowConfig {
  const config = readJsonObject(
    path.join(repoRoot, 'config/adversarial-agents/workflow.json'),
  ) as unknown as WorkflowConfig;
  if (
    config.version !== '1.0.0' ||
    config.deterministicWorkflowName !== 'Continuous integration' ||
    config.deterministicWorkflowPath !== '.github/workflows/continuous-integration.yml' ||
    config.trustedBaseBranch !== 'main' ||
    config.maxConcurrentReviews !== 3 ||
    config.maxChangedFiles < 1 ||
    !Array.isArray(config.relevantPaths) ||
    config.relevantPaths.length === 0
  ) {
    throw new Error('Adversarial workflow configuration is invalid');
  }
  return config;
}

function validateRepository(repository: string, field: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`${field} must use owner/name format`);
  }
}

function validateSha(value: string, field: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(`${field} must be a full lowercase commit SHA`);
}

function globToRegex(pattern: string): RegExp {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        expression += '.*';
        index += 1;
      } else {
        expression += '[^/]*';
      }
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`);
}

function isRelevantPath(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(filePath));
}

const SOURCE_ISSUE_PATTERNS = {
  ralphMarker: [/<!--\s*ralph-issue:\s*(\d+)\s*-->/gi],
  branch: [/(?:^|\/)issue-(\d+)(?:[-/]|$)/gi],
  declaration: [
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|track(?:s|ed)?|address(?:e[sd])?)\s*:?\s*#(\d+)\b/gi,
    /\bsource\s+issue\s*:?\s*#(\d+)\b/gi,
    /^\s*issue\s*:?\s*#(\d+)\s*$/gim,
  ],
};

function issueReferences(text: string, patterns: RegExp[]): Set<number> {
  const references = new Set<number>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) references.add(Number(match[1]));
  }
  return references;
}

function extractIssueNumber(pullRequest: PullRequestMetadata): number {
  const signalGroups = [
    issueReferences(pullRequest.body, SOURCE_ISSUE_PATTERNS.ralphMarker),
    issueReferences(pullRequest.headRef, SOURCE_ISSUE_PATTERNS.branch),
    issueReferences(`${pullRequest.title}\n${pullRequest.body}`, SOURCE_ISSUE_PATTERNS.declaration),
  ];
  if (signalGroups.some((references) => references.size > 1)) {
    throw new Error('Pull request must identify exactly one source issue');
  }
  const references = new Set(signalGroups.flatMap((group) => [...group]));
  if (references.size !== 1) {
    throw new Error('Pull request must identify exactly one source issue');
  }
  const [issueNumber] = references;
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error('Source issue number is invalid');
  }
  return issueNumber;
}

function acceptanceCriteria(issueBody: string): string[] {
  const checklist = issueBody
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  if (checklist.length > 0) return checklist;
  const normalized = issueBody.trim();
  if (!normalized) throw new Error('Source issue body is required');
  return [normalized];
}

function eventPullRequestNumbers(workflowRun: JsonObject): number[] {
  if (!Array.isArray(workflowRun.pull_requests)) return [];
  return workflowRun.pull_requests
    .map((pullRequest) => (isObject(pullRequest) ? Number(pullRequest.number) : Number.NaN))
    .filter((number) => Number.isInteger(number) && number > 0);
}

async function resolvePullRequest(
  transport: GitHubMetadataTransport,
  repository: string,
  workflowRun: JsonObject,
): Promise<PullRequestMetadata> {
  const numbers = [...new Set(eventPullRequestNumbers(workflowRun))];
  if (numbers.length > 1) throw new Error('Continuous integration run references multiple pull requests');
  if (numbers.length === 1) return transport.getPullRequest(repository, numbers[0]);

  const headRepository = isObject(workflowRun.head_repository) ? workflowRun.head_repository : {};
  const headRepositoryName = String(headRepository.full_name ?? '');
  validateRepository(headRepositoryName, 'workflow_run.head_repository.full_name');
  const headOwner = headRepositoryName.split('/')[0];
  const headRef = String(workflowRun.head_branch ?? '');
  if (!/^[A-Za-z0-9._/-]+$/.test(headRef) || headRef.includes('..')) {
    throw new Error('workflow_run.head_branch is invalid');
  }
  const candidates = await transport.findOpenPullRequestsByHead(repository, headOwner, headRef);
  const headSha = String(workflowRun.head_sha ?? '');
  const exact = candidates.filter((pullRequest) => pullRequest.headSha === headSha);
  if (exact.length !== 1) {
    throw new Error('Unable to resolve exactly one pull request for the workflow head SHA');
  }
  return exact[0];
}

async function prepareAdversarialWorkflow(options: {
  repoRoot: string;
  repository: string;
  event: unknown;
  transport: GitHubMetadataTransport;
}): Promise<PreparedWorkflow> {
  validateRepository(options.repository, 'repository');
  const config = loadWorkflowConfig(options.repoRoot);
  if (!isObject(options.event) || !isObject(options.event.workflow_run) || !isObject(options.event.repository)) {
    throw new Error('Event must contain workflow_run and repository objects');
  }
  const eventRepository = String(options.event.repository.full_name ?? '');
  if (eventRepository !== options.repository) throw new Error('Workflow event repository does not match');
  const workflowRun = options.event.workflow_run;
  const workflowRunId = Number(workflowRun.id);
  const workflowRunAttempt = Number(workflowRun.run_attempt);
  if (!Number.isInteger(workflowRunId) || workflowRunId < 1 || !Number.isInteger(workflowRunAttempt)) {
    throw new Error('Workflow run identity is incomplete');
  }
  if (
    workflowRun.name !== config.deterministicWorkflowName ||
    workflowRun.path !== config.deterministicWorkflowPath ||
    workflowRun.event !== 'pull_request' ||
    workflowRun.status !== 'completed'
  ) {
    throw new Error('Event is not a completed pull-request Continuous integration run');
  }
  if (workflowRun.conclusion !== 'success') {
    return {
      eligible: false,
      reason: `deterministic-ci-${String(workflowRun.conclusion ?? 'missing')}`,
      repository: options.repository,
      workflowRunId,
      workflowRunAttempt,
    };
  }
  const workflowHeadSha = String(workflowRun.head_sha ?? '');
  validateSha(workflowHeadSha, 'workflow_run.head_sha');
  const pullRequest = await resolvePullRequest(options.transport, options.repository, workflowRun);
  validateRepository(pullRequest.baseRepository, 'pull request base repository');
  validateRepository(pullRequest.headRepository, 'pull request head repository');
  validateSha(pullRequest.baseSha, 'pull request base SHA');
  validateSha(pullRequest.headSha, 'pull request head SHA');
  if (
    pullRequest.state !== 'open' ||
    pullRequest.baseRepository !== options.repository ||
    pullRequest.baseRef !== config.trustedBaseBranch
  ) {
    throw new Error('Pull request does not target the trusted base repository and branch');
  }
  if (pullRequest.headSha !== workflowHeadSha) {
    return {
      eligible: false,
      reason: 'stale-head-sha',
      repository: options.repository,
      workflowRunId,
      workflowRunAttempt,
      pullRequestNumber: pullRequest.number,
      headSha: workflowHeadSha,
    };
  }
  const eventHeadRepository = isObject(workflowRun.head_repository)
    ? String(workflowRun.head_repository.full_name ?? '')
    : '';
  if (eventHeadRepository !== pullRequest.headRepository) {
    throw new Error('Workflow and pull-request head repositories do not match');
  }
  const changedFiles = await options.transport.listPullRequestFiles(
    options.repository,
    pullRequest.number,
    config.maxChangedFiles,
  );
  if (changedFiles.length === 0) throw new Error('Pull request changed-file metadata is missing');
  if (!changedFiles.some((filePath) => isRelevantPath(filePath, config.relevantPaths))) {
    return {
      eligible: false,
      reason: 'no-relevant-changes',
      repository: options.repository,
      workflowRunId,
      workflowRunAttempt,
      pullRequestNumber: pullRequest.number,
      headSha: workflowHeadSha,
    };
  }
  const issueNumber = extractIssueNumber(pullRequest);
  const issue = await options.transport.getIssue(options.repository, issueNumber);
  if (issue.number !== issueNumber || !issue.title.trim() || !issue.body.trim()) {
    throw new Error('Source issue metadata is incomplete');
  }
  const collectorInput: JsonObject = {
    issue: {
      number: issue.number,
      url: issue.htmlUrl,
      title: issue.title,
      body: issue.body,
      acceptanceCriteria: acceptanceCriteria(issue.body),
    },
    pullRequest: {
      number: pullRequest.number,
      url: pullRequest.htmlUrl,
      repository: options.repository,
      title: pullRequest.title || '(no pull request title)',
      body: pullRequest.body || '(no pull request description provided)',
      author: pullRequest.author || 'unknown',
      baseSha: pullRequest.baseSha,
      headSha: pullRequest.headSha,
      baseRef: pullRequest.baseRef,
      headRef: pullRequest.headRef,
      isFork: pullRequest.headRepository !== options.repository,
    },
  };
  return {
    eligible: true,
    reason: 'ready',
    repository: options.repository,
    workflowRunId,
    workflowRunAttempt,
    pullRequestNumber: pullRequest.number,
    issueNumber,
    baseSha: pullRequest.baseSha,
    headSha: pullRequest.headSha,
    headRepository: pullRequest.headRepository,
    headRepositoryUrl: `https://github.com/${pullRequest.headRepository}.git`,
    capacitySlot: (pullRequest.number - 1) % config.maxConcurrentReviews,
    collectorInput,
  };
}

class GitHubRestMetadataTransport implements GitHubMetadataTransport {
  private readonly token: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(token: string, fetchImplementation: typeof fetch = fetch) {
    if (!token.trim()) throw new Error('GITHUB_TOKEN is required for metadata resolution');
    this.token = token;
    this.fetchImplementation = fetchImplementation;
  }

  private async request(url: URL): Promise<unknown> {
    if (url.origin !== 'https://api.github.com') throw new Error('GitHub API destination is not allowed');
    const response = await this.fetchImplementation(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub metadata request failed with HTTP ${response.status}`);
    return response.json();
  }

  private pullRequest(value: unknown): PullRequestMetadata {
    if (!isObject(value) || !isObject(value.base) || !isObject(value.head)) {
      throw new Error('GitHub returned invalid pull-request metadata');
    }
    const baseRepository = isObject(value.base.repo) ? value.base.repo : {};
    const headRepository = isObject(value.head.repo) ? value.head.repo : {};
    const user = isObject(value.user) ? value.user : {};
    return {
      number: Number(value.number),
      htmlUrl: String(value.html_url ?? ''),
      title: String(value.title ?? ''),
      body: String(value.body ?? ''),
      state: String(value.state ?? ''),
      author: String(user.login ?? ''),
      baseSha: String(value.base.sha ?? ''),
      baseRef: String(value.base.ref ?? ''),
      baseRepository: String(baseRepository.full_name ?? ''),
      headSha: String(value.head.sha ?? ''),
      headRef: String(value.head.ref ?? ''),
      headRepository: String(headRepository.full_name ?? ''),
    };
  }

  async getPullRequest(repository: string, number: number): Promise<PullRequestMetadata> {
    return this.pullRequest(await this.request(new URL(`https://api.github.com/repos/${repository}/pulls/${number}`)));
  }

  async findOpenPullRequestsByHead(
    repository: string,
    headRepositoryOwner: string,
    headRef: string,
  ): Promise<PullRequestMetadata[]> {
    const url = new URL(`https://api.github.com/repos/${repository}/pulls`);
    url.searchParams.set('state', 'open');
    url.searchParams.set('head', `${headRepositoryOwner}:${headRef}`);
    url.searchParams.set('per_page', '100');
    const value = await this.request(url);
    if (!Array.isArray(value)) throw new Error('GitHub returned invalid pull-request search metadata');
    return value.map((pullRequest) => this.pullRequest(pullRequest));
  }

  async listPullRequestFiles(repository: string, number: number, maximum: number): Promise<string[]> {
    const files: string[] = [];
    for (let page = 1; page <= Math.ceil(maximum / 100) + 1; page += 1) {
      const url = new URL(`https://api.github.com/repos/${repository}/pulls/${number}/files`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));
      const value = await this.request(url);
      if (!Array.isArray(value)) throw new Error('GitHub returned invalid pull-request file metadata');
      for (const file of value) {
        if (!isObject(file) || typeof file.filename !== 'string') {
          throw new Error('GitHub returned an invalid changed-file entry');
        }
        files.push(file.filename);
        if (files.length > maximum) throw new Error('Pull request exceeds the reviewed changed-file limit');
      }
      if (value.length < 100) return [...new Set(files)].sort();
    }
    throw new Error('Pull request changed-file pagination did not complete');
  }

  async getIssue(repository: string, number: number): Promise<IssueMetadata> {
    const value = await this.request(new URL(`https://api.github.com/repos/${repository}/issues/${number}`));
    if (!isObject(value)) throw new Error('GitHub returned invalid issue metadata');
    return {
      number: Number(value.number),
      htmlUrl: String(value.html_url ?? ''),
      title: String(value.title ?? ''),
      body: String(value.body ?? ''),
    };
  }
}

function parseArguments(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-eligible') {
      args['require-eligible'] = true;
      continue;
    }
    if (!argument.startsWith('--') || argv[index + 1] === undefined) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    args[argument.slice(2)] = argv[++index];
  }
  return args;
}

function appendOutput(filePath: string, name: string, value: string | number | boolean | undefined): void {
  if (value === undefined) return;
  if (!/^[A-Za-z0-9_.:/-]+$/.test(String(value))) {
    throw new Error(`Workflow output ${name} contains unsupported characters`);
  }
  fs.appendFileSync(filePath, `${name}=${String(value)}\n`);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(String(args['repo-root'] ?? '.'));
  const eventPath = String(args.event ?? process.env.GITHUB_EVENT_PATH ?? '');
  const repository = String(args.repository ?? process.env.GITHUB_REPOSITORY ?? '');
  const outputPath = String(args.output ?? '');
  const githubOutput = String(args['github-output'] ?? process.env.GITHUB_OUTPUT ?? '');
  if (!eventPath || !repository || !outputPath || !githubOutput) {
    throw new Error('--event, --repository, --output, and --github-output are required');
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const prepared = await prepareAdversarialWorkflow({
    repoRoot,
    repository,
    event: readJsonObject(eventPath),
    transport: new GitHubRestMetadataTransport(token),
  });
  const expectedValues: Array<[string, string | number | undefined]> = [
    ['expected-base-sha', prepared.baseSha],
    ['expected-head-sha', prepared.headSha],
    ['expected-issue-number', prepared.issueNumber],
    ['expected-pull-request-number', prepared.pullRequestNumber],
  ];
  for (const [argument, actual] of expectedValues) {
    if (args[argument] !== undefined && String(args[argument]) !== String(actual)) {
      throw new Error(`${argument} does not match the current pull-request metadata`);
    }
  }
  appendOutput(githubOutput, 'eligible', prepared.eligible);
  appendOutput(githubOutput, 'reason', prepared.reason);
  appendOutput(githubOutput, 'pull_request_number', prepared.pullRequestNumber);
  appendOutput(githubOutput, 'issue_number', prepared.issueNumber);
  appendOutput(githubOutput, 'base_sha', prepared.baseSha);
  appendOutput(githubOutput, 'head_sha', prepared.headSha);
  appendOutput(githubOutput, 'head_repository', prepared.headRepository);
  appendOutput(githubOutput, 'head_repository_url', prepared.headRepositoryUrl);
  appendOutput(githubOutput, 'capacity_slot', prepared.capacitySlot);
  if (prepared.collectorInput) {
    fs.writeFileSync(path.resolve(outputPath), `${stableStringify(prepared.collectorInput, 2)}\n`);
  }
  if (args['require-eligible'] && !prepared.eligible) {
    throw new Error(`Adversarial review is not eligible: ${prepared.reason}`);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { GitHubRestMetadataTransport, acceptanceCriteria, extractIssueNumber, prepareAdversarialWorkflow };
export type { GitHubMetadataTransport, IssueMetadata, PreparedWorkflow, PullRequestMetadata };
