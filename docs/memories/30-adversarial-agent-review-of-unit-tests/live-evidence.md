# US-009 live evidence

This page records non-sensitive rollout evidence for issue #30. Credentials,
tokens, model responses, and sensitive deployment output are intentionally not
stored here.

## Azure deployment

- Subscription: `11213dbd-39fe-46ba-87db-5f5e8c449aed`
- Tenant: `2eb901f0-9121-422e-bfcd-bcfc05394427`
- Production resource group: `game-hub-adversarial-agents-prod`
- Azure OpenAI account: `game-hub-adversarial-openai`
- Deployment: `game-hub-unit-test-reviewer`
- Model: `gpt-4.1-mini`, version `2025-04-14`, `GlobalStandard`, East US
- Deployment capacity: 500 units (500,000 tokens per minute)
- Initial deployment correlation:
  `7dca6b16-a9f2-464f-a791-72601f67ab51`
- Repeat deployment correlation:
  `f8550726-5f62-4e9e-8869-2658334c7ea1`
- Both deployments completed with `Succeeded`. The repeat what-if contained no
  creates or deletes; its only modify noise was Azure-normalized budget
  timestamps and service-returned read-only deployment properties.
- The deployed account reports local authentication disabled. The production
  budget is `$99` monthly with actual 80%, forecast 100%, and actual 100%
  notifications.

## Identity and GitHub environments

- Separate Microsoft Entra ID applications exist for inference, test
  deployment, and production deployment.
- Federated subjects are exact protected environments with immutable GitHub
  owner and repository IDs:
  `repo:jdylanmc@6954990/game-hub@1330993568:environment:adversarial-review`,
  `repo:jdylanmc@6954990/game-hub@1330993568:environment:test`, and
  `repo:jdylanmc@6954990/game-hub@1330993568:environment:prod`.
- `test` and `prod` require a reviewer and protected branches. The
  `adversarial-review` environment is restricted to protected branches.
- Environment variables contain only client, tenant, reviewer-principal, and
  endpoint identifiers. No Azure OpenAI key or client secret exists in GitHub
  environment configuration.
- The inference identity has only **Cognitive Services OpenAI User** at the
  Azure OpenAI account. Deployment identities have only the declarative custom
  deployment role and may assign only that inference role.

## Calibration and exact-head publication

The committed report
`config/adversarial-agents/active-calibration-unit-test-reviewer.json` is a real
Azure run generated at `2026-08-12T01:46:54.044Z`:

- report SHA-256:
  `f95f63ed1058fed5e7a9f8f7f303665a7a8b523ac806367980246f182c602b5e`
- calibration fingerprint:
  `e9b25914d8ebfe2f78453cc80f05044d6057a4a8fa10ccd03fc011a189afa247`
- 18 cases, three repetitions each, and 242,731 measured tokens
- 100% weak-pattern detection, zero strong false positives, zero errors, and
  zero missed critical scenarios
- 100% repeated-review agreement
- `$0.002505` average estimated cost and 8,500 ms p95 latency

`yarn policy:calibration` makes this promotion check part of deterministic
repository policy. A stale fingerprint or any threshold failure blocks
continuous integration before model-backed pull-request review.

The first complete live pull-request review evaluated commit
`873d069048e39fa32029502e4b79c034cf7ba606` and returned `PASS` with no findings.
It consumed 438,144 measured tokens at an estimated cost of `$0.175828`.

The final publication is the unique GitHub check named
`Adversarial Review / unit-test-reviewer` on the current PR #35 head. Its check
output and retained redacted evidence manifest contain the exact head, issue,
pull request, model, prompt, policy, tools, calibration, timing, token, and cost
attribution. The PR body records the final head and check identifiers without
requiring a follow-up commit that would invalidate the exact-head binding.

## Required checks and Ralph

Strict `main` branch protection requires both:

- `Continuous integration`
- `Adversarial Review / unit-test-reviewer`

The protection rule keeps the branch up to date and applies to administrators.
Repository policy, Ralph runtime status, prioritization, and deterministic tests
enforce the same names through `config/ralph-required-checks.json`. Missing,
stale, duplicated, pending, canceled, timed-out, malformed, neutral, or failed
required results cannot complete the issue loop.

## Post-merge regression evidence

The preceding evidence remains the historical record for PR #35 and its
pre-merge head. It did not prove that the newly protected `workflow_run`
bootstrap worked on a fresh runner after merge.

Protected-main adversarial run
[`31556974503`](https://github.com/jdylanmc/game-hub/actions/runs/31556974503)
failed in `Install protected base dependencies` before pull-request resolution.
Yarn reported that `node_modules/.yarn-state.yml` was absent because the job
invoked the `install:check` package script before direct installation. Review of
the merged Continuous Integration workflow also found that its evidence
pipelines used `tee` without `pipefail`, so identical Yarn failures could be
masked by a successful `tee` exit.

Issue #30 was reopened for bounded story US-010. Protected main remains affected
until that remediation is merged and a fresh protected-main run verifies
pull-request resolution and exact-head check publication.

## Remediation pre-merge evidence

The first exact-head Continuous Integration run for remediation PR #40,
[`31557874975`](https://github.com/jdylanmc/game-hub/actions/runs/31557874975),
failed twice at direct immutable installation because the public registry no
longer served locked transitive dependency `uri-js@4.4.2`. This failure is
additional evidence that `pipefail` now exposes the originating Yarn result
rather than accepting `tee`.

The second and final remediation attempt constrains that `^4.2.2` transitive
dependency to registry-available `4.4.1`. The isolated proof installs with Yarn
hardened mode enabled and global cache disabled before running all 14 failure
probes. The complete local validation gate passed again. Exact-head GitHub
checks after this correction remain the publication authority.

## Immutable identity remediation

Post-merge protected run
[`31560385215`](https://github.com/jdylanmc/game-hub/actions/runs/31560385215)
proved the workflow and environment were correct but Microsoft Entra ID still
trusted the legacy name-only subject. The failed token metadata was:

- issuer: `https://token.actions.githubusercontent.com`
- subject:
  `repo:jdylanmc@6954990/game-hub@1330993568:environment:adversarial-review`
- audience: `api://AzureADTokenExchange`
- workflow:
  `jdylanmc/game-hub/.github/workflows/adversarial-review.yml@refs/heads/main`

Read-only Azure inspection found one credential on each application, all using
the legacy `repo:jdylanmc/game-hub:environment:*` subject. The existing
applications were onboarded once with immutable Microsoft Graph `uniqueName`
values, as required for managing resources created outside Bicep. The pinned
Microsoft Graph Bicep extension then reconciled all three credentials through
subscription-scoped deployments:

- adversarial review:
  `5e2d230b-94e7-49bb-a490-70aba25d371b`
- test deployment: `e3662315-40f1-40da-a806-0a0a2cb8da9b`
- production deployment: `48887ec1-2e0d-46da-b668-673314cfed4d`
- repeat adversarial reconciliation:
  `3d6cac37-d473-4285-afa1-9b6d56bf9780`

All deployments succeeded in subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`. Readback showed exactly one credential
per application with the exact immutable subject, issuer, and audience. Azure
what-if completed with the expected `ExtensibleResourceNotSupported` warning
for the Graph resource, so repeat deployment plus readback is the authoritative
convergence evidence.

Continuous Integration run
[`31557612517`](https://github.com/jdylanmc/game-hub/actions/runs/31557612517)
attempt 3 passed again for PR #39 head
`49240626b04f5a85828edb2bfcdaf16366309a5e`. That completion triggered fresh
protected-main run
[`31561212543`](https://github.com/jdylanmc/game-hub/actions/runs/31561212543).
Azure login succeeded with the immutable subject, the bounded reviewer returned
`PASS`, and exact-head check
[`94003877768`](https://github.com/jdylanmc/game-hub/runs/94003877768)
completed successfully with zero findings on that exact pull-request head.

## Ralph source-issue resolver remediation

PR #37 head `ac2f41696798b03cacbd9ccb051b6730462f4826` had genuine
Continuous Integration success, but protected run
[`31560833700`](https://github.com/jdylanmc/game-hub/actions/runs/31560833700)
failed before model access with
`Pull request must identify exactly one source issue`.

Inspection found:

- canonical body marker `ralph-issue:27`;
- explicit body declaration `Tracks #27`;
- branch `ralph/issue-27-repository-wide-code-linting`;
- incidental dependency prose `issue #30`; and
- zero GitHub linked closing issues.

The old resolver unioned every `issue #N` phrase with canonical signals, so the
dependency prose incorrectly made the set `{27, 30}`. The corrected resolver
uses only canonical Ralph markers, issue branches, and explicit
close/fix/resolve/track/address declarations. It still rejects multiple or
disagreeing canonical signals. Repository policy rejects restoring generic
issue matching or removing agreement checks.

Protected `main` cannot execute an unmerged resolver change. To restore the
affected pull request without bypassing that boundary, PR #37's body was
normalized from `Integrated dependency issue #30` to
`Integrated the adversarial review dependency`; its canonical issue #27 marker,
declaration, branch, head SHA, and code were unchanged.

Continuous Integration run
[`31560643929`](https://github.com/jdylanmc/game-hub/actions/runs/31560643929)
then passed again on the exact head and triggered protected run
[`31562174681`](https://github.com/jdylanmc/game-hub/actions/runs/31562174681).
The resolver selected issue #27, immutable OpenID Connect authentication
succeeded, and exact-head check
[`94006743369`](https://github.com/jdylanmc/game-hub/runs/94006743369)
published `PASS` with zero findings on
`ac2f41696798b03cacbd9ccb051b6730462f4826`.

OIDC PR #41 was merged by `jdylanmc` during the resolver remediation as main
commit `f8ad8715f13edc9bb5ecb737f695461a311848e1`. GitHub closed issue #30 at
merge; it was reopened immediately because the resolver correction still
requires review and merge. The resolver commit was rebased onto that exact main
head on branch `fix/issue-30-ralph-source-resolution`.

Continuous Integration attempt 3 on the unchanged PR #37 head triggered a
second, fully post-merge protected run
[`31562408350`](https://github.com/jdylanmc/game-hub/actions/runs/31562408350).
It checked out main `f8ad8715f13edc9bb5ecb737f695461a311848e1`,
resolved issue #27, authenticated through the merged immutable credential, and
updated exact-head check `94006743369` to `PASS` with zero findings. This is the
authoritative combined post-merge OIDC and live resolver-workaround proof.
