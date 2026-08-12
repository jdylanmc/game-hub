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
- Exceptions are exact, short-lived protected-base records. They never rewrite
  reviewer output and can affect only one agent, run, head, and finding.
- Each registered reviewer owns hashed prompt/schema/policy/runtime/calibration
  inputs plus a unique check and state namespace; shared identity is rejected.

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

## 2026-08-11 - Iteration 4: US-003 completion

- Added `scripts/collect-adversarial-context.ts` and the canonical
  `yarn context:collect` command. Inputs are explicit issue requirements and
  pull-request metadata plus locally available base/head commit objects; the
  collector performs no network access.
- Added versioned selection and byte limits in
  `config/adversarial-agents/context-collector.json`, including a one-megabyte
  packet ceiling, 256 KiB evidence budget, per-file/patch bounds, deterministic
  patterns, and mandatory section policy.
- Collects production and test diffs, contracts, manifests, generators,
  workflows, validation configuration, and relevant existing tests. Diff hunks
  retain exact old/new line numbers; repository blobs retain path and included
  line range.
- Treats issue, pull-request, diff, and repository content as inert untrusted
  data. Git runs without hooks, local/system configuration, external diffs,
  text conversion, or interpreted pathspecs; blobs are read by object ID and no
  pull-request code is checked out or executed.
- Canonical input/configuration hashes and exact issue, pull-request, base, and
  head identities make output attributable and byte-for-byte reproducible.
- Mandatory missing, binary, file-limited, globally limited, oversized, or
  truncated context produces a stable `BLOCKED` packet and exit code 3.
- Added ten tests covering malicious fork prompt injection and non-execution,
  binary/large content, rename/delete status, truncation, deterministic
  ordering and output, exact line citations, serialized packet bounds, local
  command reproduction, and required-context failures.
- Passed the complete deterministic suite in cheapest-to-most-expensive order:
  immutable install, formatting, lint, policy, generation, typecheck, security
  audit, 39 tests with coverage, production build, bundle budgets, Storybook,
  and 11 fail-closed continuous-integration probes.
- US-003 is passed. US-004 and later stories were not advanced. Model prompt
  construction, invocation, and enforcement remain future-story work.

## 2026-08-11 - Iteration 5: US-004 completion

- Added the pinned Azure Identity 4.13.1 client and
  `scripts/review-adversarial-context.ts`. The live transport obtains a
  Microsoft Entra ID token and sends only bearer authentication; Azure OpenAI
  API-key environment variables are rejected.
- Added strict environment validation for the configured
  `game-hub-unit-test-reviewer` deployment and HTTPS
  `*.openai.azure.com` destination. Unit tests use injected fake transports and
  require no deployed resource, identity, credential, or network.
- Added an independently versioned and hashed system policy. Requests keep that
  system policy, the human-tunable reviewer prompt, and canonical
  hash/length-delimited untrusted evidence in separate system, developer, and
  user messages. The model receives no tools.
- Added versioned engine configuration for context/input/output bytes and
  tokens, 60-second timeout, two identified-transient retries, maximum
  three-review concurrency, allowed destination, credential scope, deployment,
  and a conservative $0.25 per-review estimated cost ceiling.
- Retries apply only to transient network errors and HTTP 408, 429, 500, 502,
  503, and 504. Every retry reuses the same deeply frozen request and original
  evidence. Timeout is enforced independently of transport cooperation.
- Added strict JSON/result validation, schema and policy mismatch rejection,
  deterministic finding deduplication, and policy-derived counts/verdicts.
  Timeout, network/model, identity, malformed JSON, missing output/usage,
  schema, policy, context, output, token, and cost failures return schema-valid
  blocking `ERROR` results.
- Added seventeen deterministic tests covering prompt injection, bearer-only
  Microsoft Entra ID transport, malformed/missing/schema-invalid output,
  PASS-with-blocking mismatch, timeout, transient/nontransient retries, bounded
  network retry exhaustion, model-reported errors, duplicate findings,
  context/token/cost limits, maximum-three concurrency, destination/deployment
  validation, API-key rejection, and successful attribution.
- Added `yarn review:adversarial`, policy checks, official Microsoft references,
  architecture dependency attribution, and operating documentation.
- Passed the complete deterministic suite in cheapest-to-most-expensive order:
  immutable install, formatting, lint, policy, generation, typecheck, security
  audit, 56 tests with coverage, production build, bundle budgets, Storybook,
  and 11 fail-closed continuous-integration probes.
- US-004 is passed. US-005 and later stories were not advanced. Calibration,
  GitHub publication, workflow orchestration, deployment, and enforcement
  remain later-story work.

## 2026-08-11 - Iteration 6: US-005 completion

- Added a versioned 18-case benchmark corpus with paired intentionally weak and
  strong examples for tautologies, ineffective mocks, missing error paths, race
  conditions, duplicate score submission, collision boundaries, ZIP/archive
  traversal, authorization bypass, and cleanup leaks.
- Added deterministic evaluation through the production reviewer engine with an
  injected oracle transport. The same command supports later real Azure runs
  through Microsoft Entra ID without embedded credentials or a live deployment
  dependency in repository tests.
- Reports measure blocking-pattern detection/true positives, strong-example
  false positives, missed critical scenarios, repeated-review agreement, total
  tokens, average estimated cost, p95 latency, and reviewer error rate.
- Added a versioned Azure-only promotion policy requiring all 18 cases, two
  repetitions, 100% blocking detection, no missed critical scenarios or errors,
  at most 5% strong-example false positives, at least 95% agreement, at most
  $0.10 average cost, and at most 60-second p95 latency.
- Promotion fails closed for fixture, stale, incomplete, malformed,
  threshold-failing, internally inconsistent, or tampered reports. It
  recomputes metrics from case evidence and fingerprints the model, prompt,
  tool contract, test framework, finding schema, verdict policy, system policy,
  reviewer configuration, benchmark corpus, and architecture.
- Added 14 calibration tests and policy enforcement for corpus coverage,
  immutable thresholds, required fingerprints, canonical local commands, and
  absence of model-backed workflow execution before promotion.
- Verified the local fixture command deterministically reports perfect benchmark
  metrics (9/9 weak detections, 0/9 strong false positives, zero errors, full
  agreement, 54,000 estimated tokens, $0.0012 average estimated cost, and 10 ms
  deterministic p95 test latency) while correctly refusing promotion because it
  is not a real Azure calibration run.
- Refactored TypeScript parameter properties in the reviewer runtime so the
  documented Node.js local commands execute under the repository's runtime;
  all 17 existing reviewer tests remain passed.
- Passed the complete deterministic suite in cheapest-to-most-expensive order:
  immutable install, formatting, lint, policy, generation, typecheck, security
  audit, 70 tests with coverage, production build, bundle budgets, Storybook,
  and 11 fail-closed continuous-integration probes.
- US-005 is passed. US-006 and later stories were not advanced. A real Azure
  calibration report, GitHub check publication, workflow orchestration, live
  deployment, and enforcement remain later-story work.

## 2026-08-11 - Iteration 7: US-006 completion

- Added `scripts/publish-adversarial-evidence.ts` and the canonical
  `yarn publish:adversarial` command. The reusable publisher accepts an injected
  GitHub transport, so repository tests require no credential or network.
- Revalidates the complete reviewer result and exact repository commit before
  any GitHub API request. The live command also requires a calibration report
  that passes the versioned promotion policy.
- Lists checks for the exact head SHA and agent-specific name, creates when none
  exists, updates the sole matching run, and fails closed for duplicate,
  mismatched, or stale check attribution. Stable external, run, and finding
  fingerprints prevent a stale head from being applied to another commit.
- Maps validated high-confidence blocking findings to failure annotations and
  advisory findings to warning annotations. Check conclusions are failure for
  FAIL/ERROR, neutral for advisory PASS, and success for clean PASS.
- Deduplicates finding content independently of model-supplied IDs, sends at
  most 50 annotations per GitHub Checks API request, caps total annotations and
  output sizes, validates safe repository-relative paths/lines, and appends only
  novel annotations on reruns.
- Records superseded run and finding fingerprints in check metadata and the
  retained manifest. Because GitHub cannot delete existing annotations, the
  current retained artifact is explicitly authoritative after supersession.
- Writes an immutable run-fingerprinted evidence artifact plus one active
  agent/head manifest. The 90-day retention metadata and attribution include
  issue, pull request, repository, head SHA, agent, model, prompt version/hash,
  schema, policy, tools, calibration, review/publication timestamps, tokens,
  estimated cost, latency, and supersession.
- Redacts recognized credential-like values before check or artifact output,
  revalidates the sanitized complete result, prevents output path/symlink
  escapes, hashes the artifact, and validates manifest size, attribution,
  retention, filename, reviewer policy, and sensitive-content invariants.
- Disabled pull-request failure comments so publication uses one check instead
  of comment spam. Added policy checks that preserve publisher limits and keep
  model-backed review/publication out of workflows until US-007.
- Added 15 deterministic tests covering create/update, exact-one enforcement,
  annotation batching/limits, invalid paths and lines, advisory/blocking
  conclusions, stale reviewer/check/API SHAs, duplicate findings, superseded
  runs, artifact redaction/integrity, missing output, and list/create/update API
  failures.
- Passed the complete deterministic suite in cheapest-to-most-expensive order:
  immutable install, formatting, lint, policy, generation, typecheck, security
  audit, 85 tests with coverage, production build, bundle budgets, Storybook,
  and 11 fail-closed continuous-integration probes.
- US-006 is passed. US-007 and later stories were not advanced. Live GitHub App
  publication, the final fork-safe workflow, Azure deployment, and enforcement
  remain later-story work. The policy content change intentionally invalidates
  any older calibration report.

## 2026-08-11 - Iteration 8: US-007 completion

- Added `.github/workflows/adversarial-review.yml` using `workflow_run` for the
  canonical `Continuous integration` workflow. Resolve/model jobs are eligible
  only after a completed pull-request run concludes successfully.
- Both jobs check out the explicit protected default-branch commit identified by
  `github.sha`, verify `refs/heads/main`, and install only immutable protected-
  base dependencies. Pull-request branches, workflows, manifests, dependencies,
  tests, and scripts are never checked out or executed.
- Added `scripts/prepare-adversarial-workflow.ts` to resolve fork and same-repo
  pull requests through read-only GitHub APIs. It verifies workflow name/path,
  repository, open PR, trusted base, exact current head SHA, a single source
  issue, bounded changed-file metadata, and relevant paths before producing the
  collector input.
- Empty workflow-run PR metadata is safely recovered from validated fork owner,
  branch, and exact head SHA. Pull-request and issue content remains inert data;
  shell-consumed repository URLs, SHAs, numbers, and outputs are constrained.
- Failed, missing, canceled, noncanonical, ambiguous, irrelevant, or stale
  deterministic runs stop before model work. Every relevant later head SHA gets
  a separate resolver decision after its own successful deterministic run.
- The review job revalidates all exact metadata before Azure access and again
  immediately before publication, preventing a run for an old head from
  publishing after a new push.
- Exact base/head Git objects are fetched without checkout, hooks, credentials,
  external protocols, or PR dependency installation. The bounded collector
  remains the only consumer of untrusted repository content.
- Promoted calibration is checked before Azure authentication. The review job
  alone receives `id-token: write` and `checks: write`; metadata permissions are
  read-only. The `adversarial-review` environment scopes OpenID Connect and
  Azure variables, Azure CLI output is suppressed, and the reviewer restricts
  inference to the registered deployment and `*.openai.azure.com` endpoint.
- Pull requests map deterministically to three concurrency lanes, allowing at
  most three active isolated reviews. Runs use explicit 10- and 20-minute
  timeouts, do not cancel active lane work, and queued runs revalidate freshness
  before spending model capacity.
- Reviewer FAIL/ERROR outputs are published and then fail the workflow. Missing
  output, unexpected exit, timeout, stale head, publication failure, artifact
  failure, or non-PASS final validation also fails closed and cannot mask the
  independently required deterministic check.
- Evidence uploads use the verified immutable upload action, fail when evidence
  is absent, and retain context, result, workflow inputs, and publication
  artifacts for 90 days.
- Added versioned workflow configuration, operating/architecture documentation,
  a dedicated workflow-policy gate, 15 metadata simulations, and 10 adversarial
  mutation tests covering fork safety, exact-SHA dependency, base-code control,
  permission weakening, immutable pins, missing outputs, timeouts, concurrency,
  retention, ambiguity, and downstream head reruns.
- Verified the checkout, setup-node, Azure login, and upload-artifact full action
  SHAs exist in their upstream repositories.
- Passed the complete deterministic suite in cheapest-to-most-expensive order:
  immutable install, formatting, lint, workflow/adversarial policy, generation,
  typecheck, security audit, 110 tests with coverage, production build, bundle
  budgets, Storybook, and 11 fail-closed continuous-integration probes.
- US-007 is passed. US-008 and US-009 were not advanced. The workflow remains
  inert until merged to protected main and still requires a real promoted active
  calibration report, protected environment variables, environment-scoped
  federated identity, narrow Azure role assignment, deployed model, and live
  GitHub/Azure verification. Branch protection remains unchanged.

## 2026-08-11 - Iteration 9: US-008 completion

- Added a strict versioned exception schema and protected empty registry.
  Exceptions require an owner, rationale, exact issue URL, short expiry, exact
  agent/version/repository/head/run/finding attribution, independent approver,
  immutable issue-comment evidence, approval-record hash, and full-record
  integrity hash.
- Added deterministic exception validation/application. Malformed, expired,
  future-excessive, wildcard, unrelated, cross-agent, cross-SHA, tampered,
  self-approved, duplicate/replayed, or noncurrent exceptions fail closed.
- Publisher integration preserves the complete original reviewer result,
  records immutable exception/application fingerprints and audit evidence, and
  renders only the exact excepted blocking finding as a warning. Any
  unexcepted blocking finding or reviewer ERROR still fails the agent check.
- Added a strict independent-agent registry schema and content-hash validator.
  Each agent requires unique prompt, schema, policy, engine configuration,
  benchmark corpus, promotion policy, active calibration path, check name, and
  state namespace, plus its own bounded concurrency. Runtime, output
  validation, publication, and artifact validation bind to the selected
  registered agent.
- Updated the protected-base workflow to use the committed exception registry,
  retain the publication result, and enforce the exception-aware published
  conclusion without weakening exact-head deterministic CI gating.
- Added operator guidance for transient-only retry boundaries, quota/cost
  handling, model incidents, prompt rollback, exception administration,
  independent agent registration, and local reproduction commands.
- Added 19 deterministic tests for exception validity/failure modes,
  publisher behavior, configuration tampering, and independent-agent
  isolation. The complete cheapest-to-most-expensive suite passed: immutable
  install, formatting, lint, policy, generation, typecheck, security audit, 129
  tests with coverage, production build, bundle budgets, Storybook, and 11
  fail-closed continuous-integration probes.
- US-008 is passed. US-009 remains unadvanced. Live Azure deployment and
  calibration, protected environment configuration, federated identity,
  end-to-end model/check verification, required-check branch protection, and
  Ralph enforcement remain US-009 prerequisites.

## 2026-08-11 - US-009 recovery and completion

- Recovered the interrupted live rollout without committing `.live-review`
  context, tokens, credentials, or transient model artifacts. Added the local
  review directory to `.gitignore`.
- Verified the deployed East US `gpt-4.1-mini` `2025-04-14`
  `GlobalStandard` deployment is healthy at 500 capacity units. Bicep remains
  authoritative and its repeat deployment converges.
- Preserved the real Azure calibration promotion report: all 18 cases ran three
  times, weak-pattern detection was 100%, strong false positives and errors were
  zero, repeated-review agreement was 100%, average estimated cost was
  `$0.002505`, and p95 latency was 8,500 ms.
- Verified the interrupted live reviewer run returned a schema-valid `PASS`
  with no findings for PR #35 head `873d069048e39fa32029502e4b79c034cf7ba606`.
  Increased declared throughput to 500 capacity units so one bounded worst-case
  context fits without weakening the two-megabyte limit, three-review runtime
  concurrency cap, or `$0.25` per-review cost ceiling.
- Integrated `origin/main` commit `29dca36` and its reinforced Ralph lease,
  heartbeat, checkpoint, timeout, cancellation, recovery, and exact-head check
  handling. All focused Ralph runner, status, and parallel tests passed.
- Enabled strict `main` branch protection for both `Continuous integration` and
  `Adversarial Review / unit-test-reviewer`, while preserving the existing
  GitHub Actions binding for deterministic continuous integration.
- Reconciled every issue acceptance criterion to implementation and live
  evidence. The final PR #35 head is published only after the complete local
  suite, exact-head deterministic continuous integration, and the unique
  adversarial reviewer check succeed; the PR body records the final immutable
  check evidence.

## 2026-08-11 - Reopened workflow remediation

- Preserved the prior PR #35 rollout record as historical evidence and added
  bounded story US-010 after protected-main run `31556974503` exposed a
  fresh-runner bootstrap regression.
- Confirmed the `node-modules` linker cannot invoke the `install:check` package
  script before `node_modules/.yarn-state.yml` exists. Continuous Integration
  and both protected-base adversarial jobs now call direct
  `yarn install --immutable`.
- Continuous Integration now gives all run steps `bash -eo pipefail` semantics,
  preventing `tee` from masking a failed validation command.
- Workflow policies and mutation tests reject script-based bootstrap, missing
  pipefail, and fail-open shell overrides. The isolated failure proof now
  reproduces the original bootstrap failure, verifies direct bootstrap creates
  Yarn state, and exercises the evidence pipeline with pipefail.
- Direct installation in the new worktree created
  `node_modules/.yarn-state.yml`. The full `yarn validate` gate passed,
  including 14 isolated fail-closed probes, 151 Vitest tests, 26 Ralph tests,
  dependency audit, generation, typecheck, production build, bundle budgets,
  and Storybook.
- Exact-head pull-request publication evidence remains pending. Issue #30 stays
  open until merge and protected-main post-merge verification.
- Exact-head Continuous Integration run `31557874975` failed twice at the now
  fail-closed install pipeline because the public registry no longer served the
  locked transitive `uri-js@4.4.2`. This confirmed the previous `tee` masking
  path was removed and exposed a second tightly coupled fresh-runner blocker.
- Used the second and final remediation attempt to constrain Ajv's `^4.2.2`
  transitive resolution to registry-available `uri-js@4.4.1`. The isolated
  bootstrap proof now enables Yarn hardened mode and disables global cache so
  it must validate and fetch the committed dependency graph.
- Re-ran the complete `yarn validate` gate successfully after the lock repair.
  Exact-head checks on the corrected commit remain pending.

## 2026-08-11 - Immutable OpenID Connect identity remediation

- Read the exact failed run `31560385215`, protected workflow environment/ref,
  GitHub environment controls, repository OpenID Connect settings, and deployed
  Microsoft Entra ID federated credentials before making changes.
- Confirmed GitHub emitted immutable subject
  `repo:jdylanmc@6954990/game-hub@1330993568:environment:adversarial-review`,
  while inference, test deployment, and production deployment identities each
  trusted a legacy name-only subject.
- Added a pinned Microsoft Graph Bicep resource and three exact environment
  parameter files. The subscription-guarded deployment script previews and
  applies only to `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Onboarded the three preexisting applications once with immutable Graph
  `uniqueName` values, then deployed all three credentials declaratively. A
  repeat inference deployment succeeded and readback retained exactly one
  credential per application. Azure what-if warned that Graph extensible
  resources are not introspectable, so repeat apply plus exact readback is the
  convergence proof.
- Added a mandatory identity policy and seven focused mutation tests rejecting
  mutable subjects, incorrect numeric IDs, wrong environment mapping, an
  unpinned Graph extension, and missing explicit subscription verification.
  Policy, lint, focused tests, all Bicep builds, shell syntax, and diff checks
  passed.
- The complete `yarn validate` run reached the isolated hardened bootstrap proof
  but failed because current public-registry metadata normalized unchanged
  executable paths with `./`, which would rewrite existing lockfile entries.
  No dependency or lockfile change is part of this identity remediation.
- Re-ran exact-head Continuous Integration for affected PR #39. Attempt 3
  passed, fresh protected-main run `31561212543` authenticated successfully,
  and check `94003877768` published `PASS` on exact head
  `49240626b04f5a85828edb2bfcdaf16366309a5e`.
