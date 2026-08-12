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
  `eslint-plugin-promise`; later stories should configure these dependencies
  through the single root flat configuration.
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
