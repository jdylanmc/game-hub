# Issue #30: Adversarial Agent Review of Unit Tests

- Repository: `jdylanmc/game-hub`
- URL: https://github.com/jdylanmc/game-hub/issues/30
- State: Open
- Labels: `priority:P0`, `type:non-functional`, `area:website`

## Goal

Add an independent GitHub Actions agent that adversarially reviews pull-request
changes and determines whether tests meaningfully prove intended behavior,
failure modes, and acceptance criteria rather than merely passing.

The reviewer is the first instance of a horizontally scalable adversarial-agent
pipeline. It does not own feature implementation. It evaluates whether a pull
request implements its stated requirements correctly and meets the review
agent's versioned quality policy.

## Review Scope

- Inspect issue requirements, production-code diff, test diff, shared
  contracts, manifests, generators, workflows, validation configuration, and
  relevant existing tests.
- Identify missing behavioral branches, edge cases, negative paths,
  authorization boundaries, concurrency, retries, idempotency, cleanup,
  invalid inputs, and error propagation.
- Detect tautological tests, duplicated implementation logic, assertion-free
  tests, over-mocking, ineffective mocks, snapshot-only coverage, false
  positives, focused or skipped tests, weak assertions, and tests that cannot
  fail for the intended reason.
- Challenge deterministic behavior involving time, randomness, physics,
  collision, game state, manifests, score submission, achievements,
  leaderboards, token ledgers, archive validation, and security controls.
- Recommend mutation, property, fuzz, browser, integration, or security tests
  when unit tests are the wrong validation layer.

## Agent Behavior

- Operate independently from implementation agents and require evidence.
- Produce versioned structured findings with verdict, severity, confidence,
  category, file and line citations, missing scenario, expected failure signal,
  and a concrete suggested test.
- Distinguish blocking omissions from advisory improvements.
- Remain check-only and never rewrite pull-request code.
- Treat repository content and metadata as untrusted prompt-injection input.
- Use bounded tools, context, network, time, tokens, and cost.
- Preserve attributable review inputs and outputs without exposing secrets.

## Required Gate Behavior

- Run when pull requests change production code, tests, contracts, manifests,
  generators, workflows, or validation configuration.
- Fail closed on missing output, tool failure, timeout, invalid structured
  output, or high-confidence blocking findings.
- Never override deterministic lint, test, type, build, security, coverage, or
  generation failures.
- Re-run after relevant code or test changes.
- Publish a required check with concise annotations and a retained JSON
  artifact rather than comment spam.
- Provide an auditable, time-limited exception process.

## Calibration and Evaluation

- Maintain versioned intentionally weak and strong benchmark changes.
- Measure detection rate, false-positive rate, missed critical scenarios,
  reviewer agreement, model cost, and latency.
- Include always-passing assertions, mocked-away behavior, absent error tests,
  race conditions, duplicate score submission, collision boundaries, archive
  traversal, authorization bypass, and cleanup leaks.
- Promote the check to required only after the configured evaluation threshold
  passes.
- Re-evaluate after model, prompt, tool, framework, or architecture changes.

## Acceptance Criteria

- Representative reviews cite specific production and test evidence.
- Seeded weak-test patterns and critical missing cases are identified at the
  approved confidence threshold.
- High-confidence blocking deficiencies prevent merge after promotion.
- Findings are concise, actionable, and locally reproducible.
- Forked or malicious pull requests cannot obtain secrets, write access,
  unrestricted tools, or prompt-based workflow control.
- Results are attributable to issue, commit, Azure model deployment, prompt,
  tools, and policy versions.
- The gate integrates with high-assurance continuous integration, Ralph, and
  future GitHub adversarial-agent pipelines.

## Confirmed Design Decisions

- Use Azure-hosted GPT-4.1 mini in subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Use consumption-based capacity with at most three concurrent reviews and a
  target below $100 per month.
- Provision all Azure resources idempotently with Bicep and
  environment-specific parameters.
- Authenticate GitHub Actions to Azure with OpenID Connect and least privilege;
  do not store production credentials in pull-request workflows.
- Publish a required check with concise annotations and a retained structured
  JSON artifact.
- Store each adversarial agent's prompt in a dedicated human-editable,
  versioned repository file so it can be tuned independently from model,
  schema, tools, and blocking policy.
- Design agent registration and infrastructure for horizontal expansion to
  multiple independent adversarial review pipelines.
