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
- The required protected check is currently the composite
  `Continuous integration` job, which invokes the same root lint command used
  locally.

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
- No issue #27 story is marked passed. Existing baseline behavior is evidence
  for planning only and must be re-verified against each completed story's
  acceptance criteria.
