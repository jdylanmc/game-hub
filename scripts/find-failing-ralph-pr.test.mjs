import { describe, expect, it } from 'vitest';

import { selectFailingRalphPullRequest } from './find-failing-ralph-pr.mjs';

const repoNameWithOwner = 'jdylanmc/game-hub';
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
  statusCheckRollup: [{ conclusion: 'FAILURE' }],
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

  it('does not route passing or pending pull requests', () => {
    const passing = {
      ...pullRequest,
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    };
    const pending = {
      ...pullRequest,
      statusCheckRollup: [{ status: 'IN_PROGRESS' }],
    };

    expect(selectFailingRalphPullRequest([passing, pending], [memory], repoNameWithOwner)).toEqual({ status: 'none' });
  });

  it('fails safely when issue ownership is absent', () => {
    expect(() => selectFailingRalphPullRequest([{ ...pullRequest, body: '' }], [memory], repoNameWithOwner)).toThrow(
      /no ralph-issue identity marker/,
    );
  });

  it('fails safely when memory identity does not match', () => {
    expect(() =>
      selectFailingRalphPullRequest(
        [pullRequest],
        [{ ...memory, plan: { ...memory.plan, baseBranch: 'release' } }],
        repoNameWithOwner,
      ),
    ).toThrow(/maps to 0 matching memories/);
  });
});
