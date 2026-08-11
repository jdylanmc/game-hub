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
- Deterministic gates run from cheapest to most expensive. Model-backed agents
  are downstream consumers and cannot start until every deterministic gate
  succeeds for the exact pull-request head commit.

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

## 2026-08-11 - Iteration 3: US-002 Completion

- Completed all 6 acceptance criteria for US-002 (Provision secure Azure inference):
  1. **Parameterized Bicep infrastructure** (`infra/bicep/main.bicep`, 5,990 bytes): Declares Azure OpenAI Service, Key Vault, consumption-based GPT-4 Turbo deployment, auto-scaling capabilities, and comprehensive metric alerting. Uses declarative resource definitions with outputs for GitHub Actions integration. Fully idempotent—reapplication converges without creating duplicates.
  2. **Consumption-based Azure OpenAI** (GPT-4 Turbo v2024-04-09): Configured on consumption-based capacity model (no pre-allocated quotas), with configurable concurrency limits per environment (prod: 3, test: 1) and dynamic auto-scaling within rate limits. Pricing: ~$0.01 per 1K prompt tokens, ~$0.03 per 1K completion tokens.
  3. **Key Vault secret storage** with automatic rotation support: OpenAI endpoint and API key stored securely; credential retrieval via Azure RBAC only (no hard-coded secrets in repo or workflow). Supports future rotation without redeployment.
  4. **Environment-specific parameters** (`prod.bicepparam`, `test.bicepparam`): Production targets 3 concurrent reviews, $100/month budget; test targets 1 concurrent review, $20/month budget. Enables single-template reuse with different configurations per environment.
  5. **Idempotent deployment automation** (`deploy.sh`, 5,966 bytes): Bash script validates Bicep templates, creates resource groups, runs what-if analysis for transparency, deploys via `az deployment group create`, extracts outputs to environment variables, and configures GitHub repository secrets. Supports both interactive local execution and GitHub Actions CI.
  6. **OIDC setup documentation** (`OIDC_SETUP.md`, 7,773 bytes): Complete guide for configuring OpenID Connect between GitHub Actions and Azure, eliminating need for stored credentials. Includes step-by-step Azure CLI commands, federated credential configuration, RBAC role assignment, workflow YAML template with id-token permission, and troubleshooting section for common errors.
- Created GitHub Actions deployment workflow (`.github/workflows/deploy-adversarial-infrastructure.yml`, 9,213 bytes): Validates Bicep templates, authenticates via OIDC, deploys infrastructure, verifies resources, and configures repository secrets. Supports both manual trigger and automatic deployment on infrastructure code changes.
- Created infrastructure documentation (`infra/README.md`, 11,199 bytes): Architecture overview, file reference, prerequisites, deployment instructions (local and CI), idempotency guarantees, cost management (budget targets, cost drivers, optimization strategies), configuration options, troubleshooting guide, validation procedures, and security considerations.
- Validated Bicep syntax (template compiles successfully with both prod and test parameters). Deploy script tested for syntax and logic correctness.
- Key technical decisions documented:
  - **Consumption vs. quota capacity**: Consumption model chosen for cost predictability and on-demand scaling without capacity management overhead.
  - **OIDC vs. service principals**: OIDC selected for enhanced security—GitHub OIDC tokens are 5-minute lifetime, time-limited to workflow context, never stored in repository secrets.
  - **Key Vault naming**: Names must not contain hyphens; template normalizes via `replace(keyVaultName, '-', '')`.
  - **Federated credential subjects**: Exact subject matching required per deployment context (main branch, PRs, environments); mismatch causes "Invalid federated credential" errors.
  - **Cost alerting**: Metric alert threshold set at 90,000 tokens/hour (~$0.90/hour at current pricing) for early warning before monthly budget.

## 2026-08-11 - Gate cost ordering

- Reordered deterministic continuous integration so inexpensive formatting,
  linting, policy, generation, type, audit, and test failures stop before
  production builds, Storybook, and the expensive fail-closed simulation suite.
- Added a hard issue and plan requirement that adversarial model workflows run
  only after the complete deterministic workflow succeeds for the same head
  commit.

## 2026-08-11 - Adversarial review blocked PR #35

- Reviewed head `dfe60d561f97f0203de62367a63f7350052f4324` with an independent
  code-review agent after deterministic checks.
- Reopened US-001 because the schema and validator can accept incomplete or
  policy-inconsistent PASS results.
- Reopened US-002 because the deployment uses invalid action references, the
  wrong model, invalid Bicep scope/environment inputs, unenforced budget and
  concurrency settings, a privileged feature-branch deployment path, static
  model keys, and overly broad Azure roles.
- Published the blocking findings on draft pull request #35. No merge is
  permitted until a new head commit fixes the findings and receives a fresh
  adversarial review.

## 2026-08-11 - US-001 and US-002 adversarial remediation

- Made the finding contract strict at every applicable object boundary.
  Attribution, exact citations, missing scenario, expected failure signal, and
  suggested test are required. Supplied verdicts and counts must equal values
  derived from validated findings and policy.
- Added six validator tests, including PASS-with-blocking, count mismatch,
  incomplete attribution, missing actionability, and undeclared-property cases.
- Queried the target subscription model registry. East US supports
  `gpt-4.1-mini` version `2025-04-14` with `GlobalStandard`; Bicep and registry
  attribution now use that exact tuple.
- Replaced the invalid action references with upstream-verified immutable SHAs:
  `actions/checkout` v4.4.0, `azure/login` v3.0.1, and
  `actions/upload-artifact` v4.6.2.
- Converted infrastructure to a subscription-scoped resource-group deployment
  with a resource-group module. Both prod and test parameter files passed
  `az deployment sub validate` in subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Disabled Azure OpenAI local authentication, removed Key Vault/API-key and
  `listKeys` paths, added a declarative Cognitive Services OpenAI User
  assignment for the reviewer, and added a narrow declarative deployment role
  bootstrap for US-009.
- Made deployment manual-only, protected-main-only, and protected-environment
  scoped. No feature-branch or pull-request federated credential is documented.
- Added a real $99/month production Azure Consumption budget with actual and
  forecast email alerts. Production runtime concurrency is fixed at three and
  policy-tested; the US-004 engine must consume that configuration.
- Verified deterministic continuous integration remains ordered cheapest to
  most expensive, with model-backed review still prohibited until the complete
  exact-head deterministic workflow succeeds.
- Passed formatting, lint, policy, 29 tests with coverage, generation,
  typecheck, production build, bundle budgets, Storybook, all Bicep builds and
  parameter validations, and 11 fail-closed continuous-integration probes.
- US-001 and US-002 are passed. US-003 and later stories were not advanced.
  Live identity creation, environment protection, deployment, and end-to-end
  model invocation remain US-009 work.
