# Progress

## Codebase Patterns

- Root `yarn lint` is the canonical local and continuous integration entry
  point and must retain `--max-warnings 0`.
- ESLint uses one root flat configuration and repository-wide file globs; use
  targeted overrides rather than per-workspace configurations.
- Prettier is a separate formatting gate. `lint:fix` must not become an
  implicit repository formatter or generator.
- Exceptional ESLint suppressions are reviewed through
  `config/lint-suppressions.json`; issue #27 must preserve exact approval while
  strengthening reason and scope requirements.
- Generated and imported Mamba snapshots are not authored lint targets, but
  generators and handwritten wrappers remain in scope.
- The shared root lint toolchain pins `eslint-plugin-jsx-a11y`,
  `eslint-plugin-import-x`, `eslint-import-resolver-typescript`, and
  `eslint-plugin-promise`. Accessibility and import presets are active in the
  single root flat configuration; typed promise correctness is enforced by
  TypeScript ESLint without layering the standalone Promise preset.
- The required protected check is currently the composite
  `Continuous integration` job, which invokes the same root lint command used
  locally.
- TypeScript linting uses TypeScript ESLint project service type information
  from the root application and Node.js projects. Keep all authored TypeScript
  surfaces included in one of those projects.
- Browser globals apply to host and game source plus Storybook preview code;
  Node.js globals apply to configuration files; tests add Vitest globals;
  shared package source remains environment-neutral.
- `yarn lint` and `yarn lint:fix` run the versioned `lint:scope` gate first.
  The gate creates representative game and package workspace probes, verifies
  authored generators and wrappers remain in scope, and exercises fixable
  sentinels under every excluded output boundary without leaving files behind.
- Output exclusions use recursive workspace-safe patterns for dependencies,
  coverage, distribution, Storybook, and test-result directories. Generated
  game metadata and generated or imported Mamba paths are listed explicitly;
  handwritten Mamba wrappers and generators stay linted.
- TypeScript operational scripts use `scripts/tsconfig.json` for type-aware
  ESLint project service without adding those standalone tools to the root
  application build. Node.js declarations are pinned directly at the runtime's
  major version.
- Suppression policy parses JavaScript and TypeScript comments instead of raw
  source strings. Only one-rule `eslint-disable-next-line` and
  `eslint-disable-line` directives with a durable inline reason are eligible;
  the allowlist must repeat the exact file, line, directive, rule, and rationale
  once.
- `yarn test:lint` is the deterministic lint behavior proof. It requires exact
  structured ESLint diagnostics for rule failures, exercises canonical
  zero-warning and fix commands, and rejects fatal, setup, warning-only,
  unexpected-rule, or mixed-error false evidence.
- Workflow policy pins the local and GitHub Actions lint runtime, direct
  dependencies, canonical scripts, representative proofs, retained evidence,
  and Ralph instructions as one completion contract.
- The protected lint failure probe runs the exact Bash `pipefail`,
  `yarn lint`, and `tee` pipeline used by continuous integration and requires
  the retained log to identify the file, line, column, severity, and rule.

## 2026-08-11 - Planning

- Bound the run to issue #27, repository `jdylanmc/game-hub`, branch
  `ralph/issue-27-repository-wide-code-linting`, and base branch `main`.
- Recorded explicit continuous continuation by best judgment.
- Assigned orchestration priority 2 and dependency issue #30 because that
  active work overlaps package, configuration, scripts, workflow, and policy
  surfaces. The dependency must merge to `main` before this loop is eligible.
- Declared conservative change scopes for the shared lint configuration,
  dependency manifests, host and workspace source, Storybook, scripts, lint
  policy, documentation, root guidance, and continuous integration policy.

## Pull request #32 reconciliation

Merged pull request #32 already delivered:

- pinned ESLint `9.39.5`, TypeScript ESLint `8.66.0`, React
  `7.37.5`, React Hooks `7.1.1`, and globals `17.9.0`;
- root `yarn lint` as `eslint . --max-warnings 0`;
- a shared flat `eslint.config.js` covering repository-authored JavaScript,
  TypeScript, and TSX through dot-globs;
- React recommended, JSX runtime, React Hooks recommended, and baseline
  TypeScript recommended rules;
- exclusions for dependencies, coverage, builds, Storybook builds, generated
  Mamba snapshots, and imported Mamba source snapshots;
- exact suppression allowlisting with an external rationale field;
- a continuous integration lint step, retained lint log, workflow-policy
  requirement, composite required check, and one isolated
  `no-unused-vars` failure proof; and
- baseline continuous integration documentation.

Current inspection found these issue #27 gaps:

- `yarn lint:fix` does not exist.
- TypeScript linting uses non-type-aware recommended rules, so typed promise,
  unsafe-TypeScript, and related correctness rules are not established.
- Every TS/TSX file receives browser globals; Node.js TypeScript configuration,
  Storybook, tests, and other environments do not have precise overrides.
- React Hooks rules exist, but accessibility and dedicated import rule plugins
  are neither pinned nor demonstrated. No dedicated promise plugin is pinned.
- Current dot-globs likely include new JS/TS workspaces, but no automated proof
  prevents a future game or package workspace from silently bypassing lint.
- Existing exclusions are plausible but do not prove `lint:fix` leaves
  generated, imported, and unrelated content untouched.
- Suppression policy requires an allowlist rationale of at least ten
  characters, but current evidence does not require an inline reason, an
  explicit affected rule, or rejection of overly broad directives.
- The fail-closed harness proves only one unused JavaScript variable. It does
  not prove all requested rule families, environment behavior, warnings,
  workspace discovery, suppression cases, or safe automatic fixes.
- Lint runs inside the protected composite `Continuous integration` check, not
  a separately named required lint check. The final implementation must
  explicitly document and verify whether the composite check satisfies the
  issue requirement or introduce a narrower required-check contract.

## Current evidence

- `yarn lint` passed on the issue worktree at planning time.
- Pull request #32 is merged at commit
  `fb8daa2ccb95dce92acba06cd0f3ba76fb8ba0b7`; its recorded
  `Continuous integration` check succeeded before merge.
- US-001 is now passed. Existing baseline behavior for the remaining stories
  is planning evidence only and must be re-verified against each story's
  acceptance criteria.

## 2026-08-11 - US-001

- Recovered the cancelled quota-exhausted runner state through Ralph dry-run
  preflight, which archived the prior stopped lease before validating this
  clean worktree.
- Added root `yarn lint:fix` as
  `eslint . --fix --max-warnings 0`, preserving the same root configuration and
  zero-warning policy as `yarn lint`.
- Pinned the remaining shared toolchain dependencies:
  `eslint-plugin-jsx-a11y` 6.10.2, `eslint-plugin-import-x` 4.17.1,
  `eslint-import-resolver-typescript` 4.4.5, and
  `eslint-plugin-promise` 7.3.0. Yarn also pinned the accessibility plugin type
  package at 6.10.1.
- Files changed: `package.json`, `yarn.lock`, `plan.json`, and `progress.md`.
- Verified `yarn lint:fix` did not change the pre-existing implementation diff,
  then passed `yarn lint`, `yarn install --immutable`, `yarn format:check`,
  `yarn policy:check`, `yarn test`, `yarn typecheck`, `yarn build`,
  `yarn bundle:check`, `yarn generate:check`, `yarn build-storybook`, and
  `yarn npm audit --all --recursive --severity high`.
- US-002 is next. It should activate typed TypeScript rules and precise
  environment overrides using this pinned shared toolchain.

## 2026-08-11 - US-002

- Replaced the non-type-aware TypeScript baseline with
  `recommendedTypeChecked` and TypeScript project service integration in the
  single root flat ESLint configuration.
- Added targeted browser, Node.js, test, Storybook, package, game, React, and
  generator environment boundaries instead of assigning browser globals to
  every TypeScript file.
- Expanded the application and Node.js TypeScript projects so game and package
  tests, Storybook configuration, and Tailwind configuration participate in
  type-aware linting and repository typechecking.
- Fixed newly exposed baseline findings: removed an unnecessary Three.js
  assertion, made contract-test module typing explicit, replaced unsafe Vitest
  asymmetric matcher composition, and narrowed Tailwind theme values from
  `unknown` before using them as styles.
- Verified an isolated temporary probe failed with actionable diagnostics for
  unused code, explicit and called `any`, floating promises, and promises
  misused as void callbacks. Verified printed configurations give browser
  globals only to host, game, preview, and jsdom test code; Node.js globals only
  to configuration code; and no browser or React rules to shared package
  source.
- Passed `yarn lint`, `yarn test`, `yarn typecheck`, `yarn build`,
  `yarn bundle:check`, `yarn build-storybook`, `yarn generate:check`,
  `yarn policy:check`, and `yarn format:check`.
- US-003 is next. It should activate the pinned accessibility and import
  plugins while preserving these environment boundaries.

## 2026-08-11 - US-003

- Enabled the recommended `eslint-plugin-jsx-a11y` rules for React source and
  mapped the shared `Link` and `Button` components to their native elements so
  accessibility checks follow the rendered semantics.
- Enabled `eslint-plugin-import-x` resolution, export validation, duplicate
  detection, and leading-import ordering across authored JavaScript and
  TypeScript. TypeScript remains authoritative for named TypeScript imports,
  while the ESLint configuration and Mamba generator have narrow documented
  interop overrides for namespace-like tool APIs.
- Updated `Link` to render `children` explicitly, preserving behavior while
  making its accessible anchor content visible to static analysis.
- Verified a temporary TypeScript React probe failed with actionable
  `import-x/default`, `import-x/no-duplicates`, `import-x/no-unresolved`,
  `import-x/first`, `jsx-a11y/alt-text`, `react/jsx-no-undef`, and
  `react-hooks/rules-of-hooks` diagnostics. Effective-configuration checks
  confirmed React, Hooks, and accessibility rules apply to host and Storybook
  TSX while shared package source receives import and TypeScript rules without
  React globals or rules.
- Files changed: `eslint.config.js`, `src/components/Link.tsx`, `plan.json`, and
  `progress.md`.
- Passed the complete `yarn validate` gate: immutable install, formatting,
  lint, policy, fail-closed proofs, dependency audit, tests and coverage,
  generated-state verification, typecheck, production build, bundle budgets,
  and Storybook build.
- US-004 is next. It should prove automatic future workspace coverage and
  deliberate generated, imported, and output exclusions without broadening
  this story's rule configuration.

## 2026-08-11 - US-004

- Added `scripts/check-lint-scope.mjs` and made both canonical lint commands run
  it before ESLint. The gate creates complete representative game and package
  workspace probes, including package metadata and `AGENTS.md`, and requires
  their TypeScript unused-code violations to be reported without parser or
  setup failures.
- Narrowed and completed the versioned exclusion boundary: dependencies,
  coverage, distribution, Storybook, and test-result outputs are ignored
  recursively; generated game metadata, generated Mamba data and stories, and
  imported Mamba source are ignored by exact repository path.
- The scope gate verifies representative host, Storybook, test, current game,
  shared package, configuration, generator, and handwritten Mamba wrapper files
  are not ignored. It writes fixable sentinels beneath every generated,
  imported, coverage, and build-output boundary, runs ESLint fixing against
  them, and requires byte-identical content before cleaning every probe.
- A separate canonical-command probe created both a new game and package
  workspace and confirmed `yarn lint` failed on both paths for
  `@typescript-eslint/no-unused-vars`.
- Verified `yarn lint:fix` preserved the authored diff plus representative
  generated game, generated Mamba, imported Mamba, and generated story files.
- Passed the complete `yarn validate` gate: immutable install, formatting,
  lint and scope policy, suppression and workflow policy, fail-closed proofs,
  dependency audit, tests and coverage, generated-state verification,
  typecheck, production build, bundle budgets, and Storybook build.
- Before publication, dependency issue #30 merged to `main`, making the pull
  request conflict and preventing an exact-head continuous integration run.
  Merged the dependency and regenerated the conflicted Yarn lockfile. The scope
  gate immediately exposed its eight new handwritten TypeScript operational
  tools, so US-004 added a dedicated script lint project, pinned
  `@types/node` 24.13.3, and retained type-aware Node.js linting.
- The imported schema-driven tools validate untrusted JSON at explicit runtime
  boundaries. Exact-file overrides preserve their merged baseline for
  structural stringification, assertion, and unsafe-value rules while keeping
  promise, call, import, unused-code, and other type-aware correctness checks
  active. The scope gate now explicitly verifies one of these TypeScript tools
  remains linted.
- Reconciled the issue publication contract with the newly required
  `Adversarial Review / unit-test-reviewer` exact-head check. The pull request
  remains draft because four stories remain.
- Re-ran the complete `yarn validate` gate after the dependency merge and lint
  integration. The expanded policy, fail-closed, Ralph, adversarial-tool, and
  application test suites all passed with the promoted calibration fingerprint
  still current.
- Exact-head `Continuous integration` passed for post-merge commit `b01443a`
  in run `31556875242`. The newly required adversarial check could not publish:
  protected-main workflow run `31556897184` failed before pull-request
  resolution because `yarn install:check` was invoked without the Yarn
  node-modules state file. The workflow intentionally executes protected
  `main`, so this issue branch cannot repair that external required-check
  blocker; the draft remains incomplete.
- US-005 is next. It should require narrow inline suppressions with exact rules
  and durable reasons, plus accepted and rejected policy cases.

## 2026-08-12 - US-005

- Fetched and merged current `origin/main` at `53aa66a` without rebasing,
  force-pushing, or discarding the four completed lint stories. The merge also
  incorporated the protected adversarial identity and Ralph source-resolution
  remediations from pull requests #41 and #42.
- Replaced raw regular-expression scanning with TypeScript ESLint comment
  parsing so directive-like strings do not become false approvals. The policy
  scans only authored JavaScript and TypeScript surfaces and mirrors the
  repository's generated, imported, dependency, coverage, test-result, and
  build-output boundaries.
- Limited approvals to one-line `eslint-disable-next-line` or
  `eslint-disable-line` comments naming exactly one rule. Every directive must
  include a specific durable inline reason of at least 20 characters, and the
  policy rejects transient TODO, FIXME, temporary, or remove-later markers.
- Defined exact allowlist semantics: every entry contains only `file`, `line`,
  `directive`, `rule`, and `rationale`; the rule and rationale exactly match
  the directive; source locations, directives, and approvals are unique; and
  stale or unapproved entries fail closed.
- Added thirteen automated cases covering both allowed scopes, directive-like
  string immunity, and unapproved, broad, multi-rule, reasonless, transient,
  duplicate, stale, rule-mismatched, rationale-mismatched, and extra-field
  policy failures.
- Updated root agent guidance and the continuous integration contract with the
  narrowest-scope rule, durable-reason requirements, exact JSON example, and
  source-plus-allowlist review path.
- Targeted evidence passed: `yarn lint:suppressions`,
  `yarn vitest run scripts/check-lint-suppressions.test.mjs
  --coverage.enabled=false`, `yarn lint`, and `yarn policy:check`.
- The first full validation exposed package-registry bin-path metadata drift in
  the newly merged lockfile during the hardened fresh-worktree proof. Refreshed
  only that metadata with pinned Yarn under hardened mode; the second and final
  `yarn validate` attempt passed immutable install, formatting, lint and policy,
  all 14 fail-closed probes, security audit, 26 Ralph tests, 175 Vitest tests,
  coverage, generation, typecheck, production build, bundle budgets, and
  Storybook.
- Exact-head continuous integration attempt one, run `31563903752`, then showed
  that the protected GitHub runner's immutable registry view required the
  pre-refresh bin paths. Restored those 20 metadata-only paths exactly as
  requested by the failed install diff; dependency versions, resolutions, and
  checksums remain unchanged. The one remaining publication attempt must prove
  this protected-runner representation before adversarial review runs.
- US-006 is next. It should add isolated representative lint and safe-fix
  proofs without broadening the now-enforced suppression exception policy.

## 2026-08-12 - US-006

- Added `scripts/prove-lint-behavior.mjs` with one isolated source probe per lint
  family. Every violation must exit with ESLint status 1, report only the exact
  expected rule identifiers at actionable file/line locations, and contain no
  fatal parser, warning, setup, or unrelated diagnostics.
- Proved TypeScript unused and unsafe rules, floating and misused promises,
  React JSX correctness, Rules of Hooks, accessibility, invalid/disordered/
  duplicate/unresolved imports, and Node.js environment isolation.
- Proved the canonical `yarn lint` command rejects exactly one `no-console`
  warning with zero errors because `--max-warnings 0` remains active.
- Proved the canonical `yarn lint:fix` command applies the supported
  `import-x/first` fix and then passes `yarn lint`. A byte snapshot verified 412
  generated, imported, and unrelated JavaScript, TypeScript, JSON, and Markdown
  files remained unchanged, including committed game discovery and Mamba
  boundaries.
- Added validator tests that deliberately mix expected diagnostics with setup
  status, fatal parser output, unexpected rules, warning-only results, and
  unrelated errors; all false evidence is rejected.
- Added `yarn test:lint` and made it the first part of the existing
  `test:ci-fail-closed` command, so the protected continuous integration proof
  runs the exact lint behavior suite without adding a second workflow contract.
- Kept the synthetic detached-worktree bootstrap deterministic by disabling
  mutable registry hardening only inside that proof. The real workflow's
  direct immutable install still performs its normal pull-request hardening;
  the later synthetic worktree now verifies fresh node-modules bootstrap from
  the committed lockfile and cache instead of accepting registry metadata drift
  as lint evidence.
- Targeted `yarn test:lint` evidence passed with 20 validator and suppression
  cases plus every live representative probe. The existing canonical lint scope
  step continues proving future workspace discovery and generated/imported
  exclusions.
- The complete `yarn validate` gate passed after the deterministic bootstrap
  adjustment: immutable install, formatting, lint and policy, 14 fail-closed
  gates, dependency audit, 26 Ralph tests, 182 Vitest tests with coverage,
  generated-state verification, typecheck, production build, bundle budgets,
  and Storybook.
- US-007 is next. It should reconcile the completed lint behavior proof with
  local, workflow, retained-evidence, and protected merge-gate contracts.

## 2026-08-12 - US-007

- Extended workflow policy across `package.json`, the pull-request and `main`
  workflow, lint behavior and fail-closed proof sources, and the Ralph
  iteration contract. It now rejects runtime drift, unpinned direct lint
  dependencies, changed canonical scripts, missing immutable bootstrap,
  removed retained logs, weakened representative proofs, and alternate
  workspace-only or direct ESLint completion commands.
- Added eight focused mutation cases proving policy rejection of warning
  tolerance, dependency ranges, workflow-only linting, removed local or
  workflow proofs, weakened actionable diagnostics, unretained protected lint
  output, and a weakened Ralph command.
- Strengthened the isolated protected-check simulation so its representative
  lint failure executes the exact `yarn lint` plus `tee` workflow pipeline
  under Bash `pipefail`. The retained log must report
  `scripts/ci-failure-probe.mjs` with line 1, column 7, error severity, and the
  `no-unused-vars` rule before the proof can pass.
- Updated the continuous integration contract for 14 fail-closed probes,
  actionable retained lint evidence, canonical Ralph behavior, and future
  GitHub Agentic Workflow reuse of the protected check rather than direct
  ESLint substitutions.
- Live repository protection was reverified through the process-local
  repository-owner token: `main` is strict and requires
  `Continuous integration` from GitHub Actions app `15368` plus
  `Adversarial Review / unit-test-reviewer`. Therefore the simulated lint
  pipeline failure makes the required protected check fail rather than
  producing mergeable evidence.
- Files changed:
  `.github/skills/ralph-loop/references/iteration-prompt.md`,
  `scripts/check-workflow-policy.mjs`,
  `scripts/check-workflow-policy.test.mjs`,
  `scripts/prove-ci-fail-closed.mjs`, `docs/continuous-integration.md`, and the
  issue plan and progress.
- Focused checks passed:
  `yarn test:lint`, 20 lint-policy and behavior tests,
  `yarn policy:workflow`, and the second fail-closed proof attempt after the
  first correctly exposed an overly specific diagnostic-rule assertion.
- The complete `yarn validate` gate passed on the first full attempt:
  immutable install, formatting, lint and policy, 14 fail-closed probes,
  dependency audit, 26 Ralph tests, 191 Vitest tests with coverage, generated
  state, typecheck, production build, bundle budgets, and Storybook.
- US-008 remains next. Keep pull request #37 draft and do not describe issue
  #27 as complete or ready.

## 2026-08-12 - US-008

- Added `docs/linting.md` as the complete repository linting contract. It
  documents `yarn lint`, `yarn lint:fix`, Prettier separation, the exact pinned
  tool and rule decisions, targeted environments, TypeScript projects,
  automatic workspace discovery, generated and imported exclusions, fix
  safety, suppression approval, and the deliberate policy for non-code files.
- Explicitly separated the merged pull request #32 baseline from issue #27's
  additions. Pull request #32 supplied the initial lint command, flat
  configuration, exclusions, suppression allowlist, workflow step, retained
  output, and one unused-variable proof. Issue #27 supplied the safe-fix
  command, type-aware and targeted rules, accessibility and import enforcement,
  workspace and exclusion proofs, reasoned narrow suppressions, comprehensive
  behavioral evidence, and protected-gate reconciliation.
- Mapped all ten issue requirements, all five pull-request integration
  requirements, all seven acceptance criteria, and all four open design
  decisions to their current local or exact-head publication evidence.
- Updated the README command and documentation index, linked the lint contract
  from the continuous integration contract, and reconciled branch-protection
  documentation with both required exact-head checks and process-local GitHub
  authentication.
- All eight planned stories are passed. The final documentation tree passed the
  complete `yarn validate` gate. Pull request #37 records the exact-head
  `Continuous integration` and adversarial publication evidence and remains a
  human-reviewed, unmerged pull request.
