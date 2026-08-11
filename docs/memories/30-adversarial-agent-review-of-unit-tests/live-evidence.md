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
Azure run generated at `2026-08-11T22:42:33.140Z`:

- report SHA-256:
  `c1a4bf011395650993151264b5851bcdbc3ffbaaa51a9709706fcfb00f971892`
- calibration fingerprint:
  `3e297b4f2525f22d67c513929807368b26a1fc43298a7a4caf0ed9c7e80ea887`
- 18 cases, three repetitions each, and 242,339 measured tokens
- 100% weak-pattern detection, zero strong false positives, zero errors, and
  zero missed critical scenarios
- 97.2222% repeated-review agreement
- `$0.002494` average estimated cost and 39,870 ms p95 latency

`yarn policy:calibration` makes this promotion check part of deterministic
repository policy. A stale fingerprint or any threshold failure blocks
continuous integration before model-backed pull-request review.

The exact pull-request check evidence is recorded after the final repository
head is fixed.

## Required checks and Ralph

The final live branch-protection response and exact-head check binding are
recorded after promotion. Repository policy and deterministic tests enforce the
same check names through `config/ralph-required-checks.json`.
