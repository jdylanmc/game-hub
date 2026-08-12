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
