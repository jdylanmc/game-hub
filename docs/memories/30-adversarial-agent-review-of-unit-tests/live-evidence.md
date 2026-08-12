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
- Federated subjects are exact protected environments:
  `repo:jdylanmc/game-hub:environment:adversarial-review`,
  `repo:jdylanmc/game-hub:environment:test`, and
  `repo:jdylanmc/game-hub:environment:prod`.
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
