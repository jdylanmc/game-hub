import { describe, expect, it } from 'vitest';

import { selectFailingRalphPullRequest } from './find-failing-ralph-pr.mjs';

const repoNameWithOwner = 'jdylanmc/game-hub';
const requiredChecks = ['Continuous integration', 'Adversarial Review / unit-test-reviewer'];
const memory = {
  memoryDir: 'docs/memories/29-high-assurance-github-actions-ci-gates',
  plan: {
    repoNameWithOwner,
    issueNumber: 29,
    issueUrl: 'https://github.com/jdylanmc/game-hub/issues/29',
    branchName: 'ralph/issue-29-high-assurance-github-actions-ci-gates',
    baseBranch: 'main',
  },
};
const pullRequest = {
  number: 32,
  url: 'https://github.com/jdylanmc/game-hub/pull/32',
  body: '<!-- ralph-issue:29 -->',
  isDraft: true,
  headRefName: memory.plan.branchName,
  baseRefName: 'main',
  statusCheckRollup: [
    { name: requiredChecks[0], conclusion: 'SUCCESS' },
    { name: requiredChecks[1], conclusion: 'FAILURE' },
  ],
};

describe('selectFailingRalphPullRequest', () => {
  it('maps the oldest blocking Ralph pull request to its bound memory', () => {
    expect(
      selectFailingRalphPullRequest(
        [
          { ...pullRequest, number: 40, statusCheckRollup: [] },
          pullRequest,
          {
            ...pullRequest,
            number: 20,
            headRefName: 'feature/not-ralph',
          },
        ],
        [memory],
        repoNameWithOwner,
        requiredChecks,
      ),
    ).toEqual({
      status: 'failing',
      repoNameWithOwner,
      issueNumber: 29,
      issueUrl: memory.plan.issueUrl,
      branchName: memory.plan.branchName,
      baseBranch: memory.plan.baseBranch,
      memoryDir: memory.memoryDir,
      pullRequestNumber: 32,
      pullRequestUrl: pullRequest.url,
    });
  });

  it('does not route a pull request only when every required check passes', () => {
    const passing = {
      ...pullRequest,
      statusCheckRollup: requiredChecks.map((name) => ({ name, conclusion: 'SUCCESS' })),
    };

    expect(selectFailingRalphPullRequest([passing], [memory], repoNameWithOwner, requiredChecks)).toEqual({
      status: 'none',
    });
  });

  it.each([
    ['missing', [{ name: requiredChecks[0], conclusion: 'SUCCESS' }]],
    [
      'pending',
      [
        { name: requiredChecks[0], conclusion: 'SUCCESS' },
        { name: requiredChecks[1], status: 'IN_PROGRESS' },
      ],
    ],
    [
      'canceled',
      [
        { name: requiredChecks[0], conclusion: 'SUCCESS' },
        { name: requiredChecks[1], conclusion: 'CANCELLED' },
      ],
    ],
  ])('routes a Ralph pull request with a %s adversarial check', (_label, statusCheckRollup) => {
    expect(
      selectFailingRalphPullRequest(
        [{ ...pullRequest, statusCheckRollup }],
        [memory],
        repoNameWithOwner,
        requiredChecks,
      ),
    ).toMatchObject({ status: 'failing', pullRequestNumber: pullRequest.number });
  });

  it('fails safely when issue ownership is absent', () => {
    expect(() =>
      selectFailingRalphPullRequest([{ ...pullRequest, body: '' }], [memory], repoNameWithOwner, requiredChecks),
    ).toThrow(/no ralph-issue identity marker/);
  });

  it('fails safely when memory identity does not match', () => {
    expect(() =>
      selectFailingRalphPullRequest(
        [pullRequest],
        [{ ...memory, plan: { ...memory.plan, baseBranch: 'release' } }],
        repoNameWithOwner,
        requiredChecks,
      ),
    ).toThrow(/maps to 0 matching memories/);
  });
});
