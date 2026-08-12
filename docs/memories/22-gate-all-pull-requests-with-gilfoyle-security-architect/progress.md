# Progress

## Codebase Patterns

- Gilfoyle is an independently versioned agent registration on issue #30's
  shared Azure adversarial-review platform.
- Every agent owns a dedicated human-tunable prompt file; prompt version and
  content hash are recorded in each result and calibrated independently.
- Deterministic security gates remain authoritative and cannot be overridden by
  model output.
- Pull-request content is untrusted evidence and is never executed by the
  privileged review workflow.
- Model-backed security review runs only after the exact head commit passes the
  complete deterministic gate set, ordered from cheapest to most expensive.
- Security context profiles are selected only by trusted collector arguments,
  independently versioned and content-hashed, and cannot be selected or
  rewritten by issue, pull-request, diff, or repository evidence.
- Required security surfaces record bounded Git-object inventories, explicit
  trust boundaries, privileged identities, data sources and sinks, and changed
  control domains. Missing or incomplete mandatory security context blocks.
- The required `Continuous integration` check is a final fail-closed aggregate:
  deterministic validation and deterministic security must both succeed.
- Deterministic security evidence is independently versioned, content-hashed,
  exact-head attributable, count/byte bounded, and treated as inert input.
- An absent container surface is explicit `NOT_APPLICABLE`; introducing a
  container definition blocks as `UNSUPPORTED` until a reviewed scanner exists.
- Disabled agents may be exercised only through an explicit calibration-only
  runtime option; registration alone must not imply live workflow enforcement.
- Prompt-injection calibration must pair an injected safe case with an injected
  blocking vulnerability so obeying the attack cannot satisfy promotion.
- Calibration JSON and unkeyed hashes are not provenance. Promotion evidence
  must be a GitHub Sigstore artifact attestation signed by exact protected
  workflow code and checked against certificate and transparency-log evidence.
- Calibration attestation verification is same-run and exact-attempt: the
  trusted certificate run URI, repository/head, signer digest, artifact digest,
  and replay nonce must match the current protected workflow context.

## 2026-08-11 - Planning

- Bound the run to issue #22, branch
  `ralph/issue-22-gate-all-pull-requests-with-gilfoyle-security-architect`, and
  deterministic worktree `/Users/dylan/git/game-hub-worktrees/issue-22`.
- Defined issue #30 as a hard orchestration dependency because it establishes
  the shared Azure runtime, identity, schema, check publisher, calibration, and
  horizontal agent registration.
- Selected high and critical findings plus control-bypass uncertainty as
  blocking; medium findings are advisory.
- Selected emergency-only exceptions with a maximum 24-hour lifetime.
- Explicitly delegated continuous execution once dependency issue #30 is merged
  and closed.

## 2026-08-11 - US-001 Define the Gilfoyle security contract

- Safely merged dependency issue #30 from `origin/main` at
  `ea55b3f0e1bfd9cf36d40074f66bcf11ef8b7514` without rebasing or rewriting the
  issue branch.
- Added Gilfoyle's dedicated versioned prompt, security taxonomy, threat model,
  strict finding schema, blocking policy, bounded-tools contract, independent
  engine identity, and disabled shared-platform registration.
- Required exact citations, confidence, exploit or failure scenario, impact,
  remediation, and verification guidance for every finding.
- Enforced blocking for critical/high findings and confirmed/uncertain
  security-control bypasses while keeping medium findings advisory.
- Extended shared agent registration to content-hash each agent's independent
  tools contract and added a fail-closed Gilfoyle contract policy check.
- Files changed: `.github/adversarial-agents/gilfoyle-security-architect/`,
  `config/adversarial-agents/`, `scripts/validate-*`, `package.json`,
  `docs/gilfoyle-security-contract.md`, `docs/adversarial-workflow.md`,
  `AGENTS.md`, and this issue memory.
- Checks passed: focused registry and Gilfoyle contract tests (9 tests),
  `yarn agents:validate`, `yarn policy:gilfoyle`, and complete `yarn validate`
  including formatting, lint, policy, fail-closed simulations, security audit,
  177 tests, coverage, generation, type checking, production build, bundle
  budgets, and Storybook.
- Gilfoyle remains disabled and uncalibrated by design; US-002 through US-007
  own context collection, evidence integration, implementation/calibration,
  workflow registration, exceptions/outages, and live enforcement.

## 2026-08-11 - US-002 Collect security context and trust boundaries

- Added Gilfoyle's independently versioned and content-hashed bounded context
  profile and registered its attribution separately from prompt, tools, schema,
  policy, model, and workflow configuration.
- Extended the shared collector with trusted `--agent` selection and explicit
  coverage for application, game, infrastructure, workflow, dependency,
  container, configuration, contract, and manifest surfaces.
- Security packets now identify privileged identities, trusted and untrusted
  sources, privileged sinks, authentication and authorization boundaries, data
  flows, protected control-plane authority, changed boundaries, and changed
  security-control domains.
- Pull-request attempts to rewrite Gilfoyle's prompt, policy, workflow, or
  collector remain inert diff evidence. The collector still invokes only Git,
  reads object IDs without checkout, and never imports, installs, builds, tests,
  or executes pull-request content.
- Missing profiles, required surface definitions, trust-model elements,
  context sections, security-relevant diffs, binary evidence, truncation, or
  file-limit breaches produce a blocking packet. A repository with no container
  surface records that absence explicitly rather than silently skipping it.
- Added focused deterministic proofs for attribution, all required surfaces,
  trust boundaries, privileged identities, sources and sinks, control changes,
  malicious control-plane instructions, missing mandatory context, binary
  workflow evidence, and byte-identical command-line reproduction.
- Files changed: the shared collector and tests, Gilfoyle context profile,
  agent registry and validators, policy enforcement, developer documentation,
  root guidance, and this issue memory.
- Checks passed: 28 focused collector/registry/contract tests,
  `yarn agents:validate`, `yarn policy:gilfoyle`,
  `yarn policy:adversarial`, `yarn policy:check`, static formatting/lint/type
  gates, and complete `yarn validate` including fail-closed simulations,
  security audit, 158 tests, coverage, generated-state verification,
  production build, bundle budgets, and Storybook.
- Gilfoyle remains disabled and uncalibrated by design. US-003 is the next
  eligible story and owns deterministic security evidence integration.

## 2026-08-12 - US-003 Integrate deterministic security evidence

- Safely merged `origin/main` through resolver fix
  `53aa66a68bfd9554153112510a284d16d267baf8` without rebasing or rewriting
  history, preserving both main's source-issue guidance and Gilfoyle guidance.
- Split the canonical workflow into deterministic validation, a downstream
  read-only deterministic-security job, and the final required
  `Continuous integration` aggregate. Missing, skipped, canceled, or failed
  security work prevents the required check from succeeding.
- Added immutable CodeQL `3.37.6` and dependency-review `4.9.0` action commits,
  with CodeQL upload disabled, dependency comments disabled, read-only contents
  permission, no secrets, and exact untrusted-head checkout without persisted
  credentials.
- Added high-severity dependency audit, redacted added-line secret detection,
  workflow/security policy enforcement, pinned Bicep `0.42.1` compilation, and
  a container guard that fails closed when an unsupported container surface
  appears.
- Added a versioned bounded manifest containing exact repository, base/head SHA,
  workflow run/attempt, tool and configuration attribution, redacted findings,
  and evidence-file hashes. Blocking CodeQL findings produce a failed manifest
  and failed job.
- Extended Gilfoyle context collection to require that exact-head manifest and
  reject missing, failed, stale, downgraded, reordered, duplicated, oversized,
  or misattributed evidence. The manifest is inert evidence; the upstream
  workflow conclusion remains authoritative and cannot be overridden by model
  output.
- Updated fail-closed proofs for removed security scans, masked aggregate
  results, and newly unsupported container definitions. Fresh local proof
  worktrees avoid platform-specific hardened registry metadata refreshes;
  GitHub Actions retains hardened mode and the committed lock remains unchanged.
- Targeted checks passed: 45 security/context/policy tests,
  `yarn policy:workflow`, `yarn policy:adversarial`,
  `yarn policy:gilfoyle`, `yarn agents:validate`, full issue-diff secret scan,
  Bicep compilation, container-surface validation, type checking, and 17
  fail-closed simulations.
- The first published exact-head attempt exposed cross-platform hardened Yarn
  registry metadata drift during immutable install. Restored the reviewed lock
  unchanged and limited the local detached proof's hardened lookup to GitHub
  Actions, where the genuine public-pull-request hardened install remains
  enforced.
- US-004 is next and owns Gilfoyle implementation and real calibration. Gilfoyle
  remains disabled in this story.

## 2026-08-12 - Original US-004 blocked and cleaned up

- Exhausted the authorized two-attempt limit using keyless Azure identity. The
  final run was not promotable: 27.27% blocking detection, 9.09% safe false
  positives, 50% advisory escalation, 6.25% errors, and 93.75% agreement.
- Adversarial security review found a separate provenance blocker: a
  self-asserted Azure run mode plus an unkeyed report hash can be forged.
  Promotion needs non-forgeable attestation bound to a protected calibration
  run, exact commit, deployment, and artifact digest.
- Removed every incomplete US-004 implementation file and failed calibration
  report. No reviewer, workflow, required check, or status configuration was
  changed.
- Split the blocked story into US-004A for non-forgeable provenance and
  US-004B for the remaining implementation, calibration, and promotion work.

## 2026-08-12 - US-004A Attest protected calibration provenance

- Added a versioned Gilfoyle calibration-attestation policy that pins immutable
  repository owner/repository IDs, protected `main`, the exact future
  calibration workflow, GitHub-hosted runner, OpenID Connect issuer, immutable
  protected-environment workload subject, reviewed `actions/attest` commit,
  Azure deployment identity, fingerprint set, and freshness bounds.
- Added a protected-run predicate builder that binds exact repository/head,
  workflow commit/run/attempt, registered agent and configuration fingerprints,
  Azure tenant/client/deployment/model identity, benchmark corpus and case IDs,
  report hashes, uploaded artifact ID/digest, timestamps, and a replay nonce.
- Added a verifier that invokes `gh attestation verify` without a shell and
  requires the GitHub Sigstore root, exact signer/source digests and protected
  ref, GitHub OpenID Connect issuer, GitHub-hosted runner, one attestation, one
  subject, exact certificate identity/run URI, verified timestamps, and an
  exact predicate match.
- Unsigned/untrusted, duplicate, replayed, wrong-run, wrong-head, wrong-Azure,
  wrong-config, stale, future-dated, mismatched-artifact, and tampered-report
  evidence all fail closed. Repository-authored JSON cannot self-assert
  promotion.
- Added operator documentation for the required future protected-workflow
  sequence, least permissions, retained evidence, failure handling, and local
  deterministic commands. The workflow and new Azure calibration remain
  intentionally deferred to US-004B.
- Safely merged `origin/main` at
  `9199590dded564337554718ab095e056f7438006`, preserving both the new
  repository-wide lint contract and Gilfoyle's deterministic security policy.
  Combined their workflow policy/tests and taught detached fail-closed proofs
  to copy the current lint inputs before exercising uncommitted merge state.
- Checks passed: focused Prettier and ESLint, calibration-attestation policy,
  29 focused tests, complete repository policy, and complete `yarn validate`
  including 20 lint proofs, 17 fail-closed simulations, dependency audit, 246
  tests, coverage, generation, type checking, production build, bundle budgets,
  and Storybook.
- Gilfoyle remains disabled and `promotionAllowed` remains false. US-004B is
  blocked on a new authorized calibration budget and must meet the existing
  detection, false-positive, advisory-escalation, error, and agreement
  thresholds with a genuine same-run protected attestation.

## 2026-08-12 - US-004B calibration-ready checkpoint

- Implemented Gilfoyle's calibration-only runtime path for a disabled agent,
  dedicated schema and policy validation, confidence-independent security
  blocking, exact configuration fingerprints, strict reconciliation, and
  fail-closed model/runtime errors.
- Added a 24-case corpus: 11 vulnerable and 11 paired safe cases covering every
  required scenario plus prompt-injection control bypass, and two medium
  advisory cases. Promotion requires 100% blocking detection, at most 5% safe
  false positives, zero advisory escalation, zero missed critical or
  control-bypass cases, at least 95% agreement, zero errors, at most $0.10
  average cost, at most $0.25 total cost, and at most 60-second p95 latency.
- Tuned only Gilfoyle's versioned prompt and dedicated runtime configuration.
  The reviewed runtime is sequential, allows no tools, caps each request at
  $0.02, and retains the existing severity/control-bypass thresholds.
- Added the main-only `Adversarial calibration` workflow with exact protected
  checkout, Microsoft Entra ID/OpenID Connect, explicit subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`, exact dedicated deployment checks,
  two repetitions, threshold enforcement before signing, pinned
  `actions/attest`, same-run verification, and 90-day sanitized evidence.
- Added declarative Bicep for the dedicated
  `game-hub-gilfoyle-security-architect` GPT-4.1 mini `2025-04-14`
  GlobalStandard deployment at capacity 50. The first apply encountered a
  transient parent-resource conflict; serializing the child deployments and
  reapplying converged successfully. The deployment is `Succeeded`; local
  authentication remains disabled and the existing workload identity keeps its
  narrow Azure OpenAI inference role.
- Deterministic fixture metrics passed: 100% blocking detection, 0% safe false
  positives, 0% advisory escalation, zero missed critical/control-bypass cases,
  100% agreement, 0% errors, $0.0576 total estimated fixture cost, and 10 ms p95
  synthetic latency. Fixture evidence was deleted after validation because it
  cannot promote.
- Complete `yarn validate` passed: immutable install, formatting, lint, policy,
  20 lint proofs, 17 continuous-integration fail-closed simulations,
  dependency audit, 250 tests, coverage, generation, type checking, production
  build, bundle budgets, and Storybook. Both production and test Bicep
  parameter files compiled.
- Promotion failed closed before model access. US-004A pins the trusted signer,
  workflow SHA, source SHA, and source ref to the same exact
  `refs/heads/main` commit. Draft PR #39 cannot run its new workflow as that
  trusted main commit, and a feature-branch or local run would produce invalid
  attestation provenance. No fresh Azure model calls were made, so attempts
  remain 0 and model cost is $0.00; no report, predicate, bundle, or active
  calibration file was retained.
- US-004B remains incomplete. Resolving the blocker requires a human-approved
  publication sequence that first places the reviewed calibration workflow and
  fingerprinted configuration on protected main without bypassing the draft
  issue's unfinished later stories. Gilfoyle remains disabled and unpromoted.
