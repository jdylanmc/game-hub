# Progress

## Codebase Patterns

- Adversarial agents are independent required checks with versioned prompts,
  policies, models, schemas, tools, calibration, and findings.
- Pull-request content is untrusted evidence. Privileged workflow code must come
  from the protected base branch and must never execute pull-request code.
- Azure resources are idempotent Bicep deployments with environment parameter
  files, OpenID Connect authentication, least privilege, and no committed
  credentials.
- Structured results must be actionable: exact citations, missing scenario,
  expected failure signal, and a concrete suggested test.
- Each agent owns a dedicated human-tunable prompt file. Prompt versions and
  hashes are recorded in every review result and calibrated independently from
  policy, schema, tools, and model versions.

## 2026-08-11 - Planning

- Bound the run to issue #30, branch
  `ralph/issue-30-adversarial-agent-review-of-unit-tests`, and deterministic
  worktree `/Users/dylan/git/game-hub-worktrees/issue-30`.
- Confirmed issue dependencies #29 and #33 are merged to `main`.
- Selected Azure-hosted GPT-4.1 mini in subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Selected consumption capacity, a maximum of three concurrent reviews, and a
  target below $100 per month.
- Selected required GitHub check annotations plus a retained structured JSON
  artifact.
- Explicitly delegated continuous continuation until the draft pull request is
  complete or a safety blocker stops the loop.

## 2026-08-11 - Runner recursion repair

- The first fresh context recursively invoked the `ralph-loop` skill and found
  the outer runner's active lock instead of executing its bounded story.
- Updated the iteration contract and runner prompt to state that the fresh
  context is already inside Ralph and must execute directly.
- Issue #30 now explicitly requires a dedicated tunable prompt file per agent.

## 2026-08-11 - Iteration 2: US-001 Completion

- Completed all 5 acceptance criteria for US-001 (Define adversarial agent contract):
  1. **Versioned JSON schema** (`config/adversarial-agents/schema.json`, 1.0.0): Defines finding, verdict, severity, confidence, category, citations with line numbers, missing scenario, expected failure signal, suggested test, and comprehensive attribution (agentName, agentVersion, modelDeployment, promptVersion with SHA-256 hash, policyVersion, toolsVersion, repository commit, timestamp).
  2. **Dedicated prompt file** (`.github/adversarial-agents/unit-test-reviewer/prompt.md`, 1.0.0, 11,884 bytes): Human-editable markdown with explicit version 1.0.0 header, comprehensive instructions for detecting 14 categories of weak tests (tautology, mock-evasion, missing-error-case, incomplete-coverage, race-condition, fixture-collision, ineffective-mocking, no-side-effect, false-assertion, no-failure-injection, undocumented-expectation, timeout-evasion, resource-leak, authorization-bypass), JSON response template matching schema, verdict rules, citation format, and three worked examples.
  3. **Independent versioning**: Schema 1.0.0, policy 1.0.0, agents registry 1.0.0, prompt 1.0.0, and modelDeployment all versioned independently—allows upgrading components separately without full redeployment.
  4. **Validation enforcement** (`scripts/validate-adversarial-finding.ts`, 14,131 bytes): TypeScript CLI validator accepting JSON from stdin or file, enforces schema compliance, required fields, field types/formats, citation completeness (path, startLine, endLine, snippet), actionability (missingScenario, expectedFailureSignal, suggestedTest non-empty), policy compliance (verdict.decision matches severity threshold), exit codes 0/1/2/3 for automation.
  5. **Agent registration** (`config/adversarial-agents/agents-config.json`): Enables registering additional agents with independent prompts, policies, and configurations without coupling to schema.
- Validated configuration JSON syntax, computed SHA-256 hash of prompt.md (`8043aabd4090fae03973eb6e93316c065a0eac7f994d6bcc9aafd35205fd5519`), tested validator against valid and invalid example findings, confirmed exit codes and error messages.

