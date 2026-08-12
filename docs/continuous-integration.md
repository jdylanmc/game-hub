# Continuous Integration Contract

Game Hub uses one fail-closed GitHub Actions check named
`Continuous integration` as the merge and autonomous-development completion
contract. The workflow runs for every pull request and every update to `main`.

## Reproduce the contract locally

Use Node.js `24.13.0` from `.node-version` and Yarn `4.17.1` from the
`packageManager` field in `package.json`. A clean checkout can run the complete
contract with:

```bash
corepack enable
yarn validate
```

`yarn validate` and `.github/workflows/continuous-integration.yml` invoke the
same canonical root gates. The fresh GitHub runner bootstraps with direct
`yarn install --immutable`; local validation uses `yarn install:check` after
dependencies already exist:

| Command | Expected output |
| --- | --- |
| `yarn install:check` | Immutable installation succeeds without changing `yarn.lock`. |
| `yarn format:check` | Prettier reports all covered files formatted. |
| `yarn lint` | ESLint completes with zero errors and zero warnings. |
| `yarn policy:check` | Lint suppressions are approved and workflow and Code Owner invariants remain intact. |
| `yarn test:ci-fail-closed` | Canonical lint behavior proofs pass, then all 23 representative continuous integration failure probes fail for their expected reason. |
| `yarn security:audit` | The recursive dependency audit reports no high-severity findings; an unavailable registry fails the command. |
| `yarn test:ci` | Test integrity, Ralph orchestration simulations, deterministic Vitest execution, JUnit output, and configured coverage thresholds pass. |
| `yarn generate:check` | Workspace generation leaves the committed manifest and import map unchanged and clean. |
| `yarn typecheck` | All TypeScript project references compile without emitting errors. |
| `yarn build` | `dist/` contains the production website and Vite manifest. |
| `yarn bundle:check` | Entry, asynchronous chunk, JavaScript, stylesheet, and total raw-byte budgets pass. |
| `yarn build-storybook` | `storybook-static/` contains the browser-renderable Storybook build. |

The workflow runs each command directly rather than invoking a different
continuous-integration-only implementation. It pipes output to retained logs
without suppressing the command's exit status.

The complete lint design, local fix command, rule and environment choices,
workspace discovery, exclusions, pull request #32 baseline, and issue #27
acceptance evidence are documented in
[Repository Linting](linting.md).

## Fail-closed enforcement

- `yarn test:watch` runs the automatically discovered host, game, shared-package,
  and repository-script suites interactively. `yarn test` and `yarn test:ci`
  run the deterministic non-watch contract; `yarn test:coverage` remains a
  compatibility alias.
- Test integrity derives game and package roots from the root Yarn workspace
  declarations, also requires deterministic suites under `src/` and `scripts/`,
  rejects focused, skipped, todo, and quarantined tests, and disallows empty
  suites.
- Vitest shuffles tests with seed `29005` and enforces 85% line, function, and
  statement coverage plus 75% branch coverage over the configured host surface.
  Tests, hooks, and teardown each have a 10-second timeout and retries are
  disabled.
- `config/lint-suppressions.json` is the reviewed allowlist for exceptional
  ESLint suppressions. New unapproved directives fail `yarn policy:check`.
- `config/bundle-budgets.json` defines reviewed raw-byte limits. Missing build
  output and unexplained entry, chunk, JavaScript, stylesheet, or total
  regressions fail `yarn bundle:check`.
- `yarn policy:check` rejects missing mandatory commands or evidence, weakened
  triggers, permissions, concurrency, timeout, action pinning, artifact
  retention, Code Owner rules, lint runtime or dependency pins, canonical lint
  scripts, representative lint proofs, or Ralph lint completion instructions.
- `yarn test:ci-fail-closed` uses an isolated detached worktree to prove that
  formatting, lint, type, test, generation, production build, bundle budget,
  missing build output, missing workflow command, masked pipeline failure,
  invalid fresh-runner bootstrap, success-only unit-test evidence publication,
  unavailable security audit, and Storybook browser-build failures cannot
  complete successfully. Its lint probe runs the exact `yarn lint` plus `tee`
  pipeline from the workflow and verifies the retained log identifies the file,
  line, column, severity, and rule. Its representative assertion probe runs the
  canonical test pipeline and verifies that the failed run still writes the
  diagnostic log, failing JUnit result, JSON coverage summary, and LCOV report.

The required job has a 30-minute timeout and concurrency cancellation enabled.
An error, cancellation, timeout, stale generated output, unavailable mandatory
service, missing required artifact, or absent required check cannot produce a
mergeable pull request. There are no retries, `continue-on-error` gates, or
warning-only fallbacks.

## ESLint suppression review

Suppressions are exceptional policy changes, not local lint workarounds. First
prefer correcting the code or narrowing the shared rule configuration. If an
exception is still necessary:

1. Use only `eslint-disable-next-line` immediately before the affected line or
   `eslint-disable-line` on that line. File and block-wide `eslint-disable`
   directives are forbidden.
2. Name exactly one ESLint rule. Separate approvals are required when different
   rules genuinely need different exceptions at distinct locations. Refactor a
   source line rather than grouping multiple rule suppressions on one line.
3. Add ` -- ` followed by a specific durable reason in the directive. The
   reason must explain why the rule does not apply safely at that location; it
   cannot be a TODO, temporary workaround, or generic statement.
4. Add exactly one object to `config/lint-suppressions.json` with only `file`,
   `line`, `directive`, `rule`, and `rationale`. `directive` is the exact comment
   text without comment markers, while `rule` and `rationale` must exactly match
   the directive.
5. Review the source exception and allowlist entry together. Moving or changing
   the directive requires updating its exact line-bound approval; removing it
   requires removing the now-stale approval.

For example:

```json
{
  "file": "scripts/example.mjs",
  "line": 42,
  "directive": "eslint-disable-next-line no-console -- The command intentionally reports its final result to the invoking terminal.",
  "rule": "no-console",
  "rationale": "The command intentionally reports its final result to the invoking terminal."
}
```

`yarn lint:suppressions` parses authored JavaScript and TypeScript comments
rather than matching strings, requires the one-to-one exact approval, and
rejects unapproved, broad, duplicate, stale, malformed, multi-rule, reasonless,
or transient suppressions. Its automated policy cases cover both accepted
line-scoped forms and every rejected category.

## Permissions, forks, and retained evidence

The workflow grants only `contents: read`, uses `pull_request` rather than
`pull_request_target`, disables persisted checkout credentials, and does not
consume secrets. Fork pull requests therefore run the same unprivileged
contract as repository branches. Every action is pinned to a full commit SHA,
and the runner and Node.js version are pinned.

After every executed canonical test step, including a failed one, the workflow
uploads `unit-test-evidence-<run-id>-<attempt>` for 14 days. It requires the
diagnostic test log, `test-results/junit.xml`, and the complete `coverage/`
directory; missing evidence fails publication.

The workflow also uploads
`continuous-integration-evidence-<run-id>-<attempt>` for 14 days, even after a
failed gate. Missing evidence makes artifact upload fail. It contains:

- per-gate logs, including dependency-security audit and fail-closed proof;
- actionable lint diagnostics retained in `continuous-integration-evidence/lint.log`;
- JUnit test results and coverage reports;
- the production `dist/` output; and
- the static `storybook-static/` browser output.

## Merge and autonomous completion

The live `main` protection described in
[Branch Protection](branch-protection.md) requires both the
`Continuous integration` check from GitHub Actions app ID `15368` and
`Adversarial Review / unit-test-reviewer` on a branch that is current with
`main`. A missing, pending, failed, canceled, or stale required check blocks
merge. The adversarial result is downstream of successful deterministic
continuous integration and never replaces it.

Ralph checks open Ralph pull requests with `yarn ralph:prioritize` before
ranking new issues. A failed or absent check is routed to its uniquely matched
issue memory, branch, and draft pull request; ambiguous ownership stops the
loop. Ralph runs the same canonical root `yarn lint` command for local completion and
requires `yarn test:lint` plus policy validation for lint-contract changes.
Ralph and future GitHub Agentic Workflows may treat the protected
`Continuous integration` result as completion evidence, but neither may
substitute a direct ESLint command or bypass the review or merge requirements.

## Infrastructure decision

No Azure infrastructure is required for this contract. GitHub Actions,
artifacts, and branch protection provide all implementation requirements, so
this issue creates zero resource groups and has an estimated Azure cost of
`$0/month`. If a future issue requires Azure resources, it must introduce
idempotent Bicep and environment parameters, explicitly select subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`, remain within the approved resource
group and cost limits, and document the new requirement separately.

## Issue #29 acceptance evidence

| Acceptance criterion | Implementation evidence |
| --- | --- |
| Complete gates on pull requests and protected-branch updates | Workflow `pull_request` and `main` push triggers plus the 12-command contract above |
| Missing, pending, failed, canceled, or stale checks block merge | Strict `main` branch protection bound to `Continuous integration` and app ID `15368` |
| Clean checkouts reproduce every gate | Pinned Node.js and Yarn plus `corepack enable && yarn validate` |
| Representative failures block completion | Twenty-three isolated probes in `scripts/prove-ci-fail-closed.mjs`, including retained exact workflow lint and test pipelines |
| Forks need no privileged credentials | Read-only permissions, no secrets, no persisted checkout credentials, and no `pull_request_target` |
| Workflow protection cannot self-approve weakening | Code Owner review, non-last-pusher approval, and policy-checked ownership and workflow invariants |
| Outputs and security evidence have defined retention | Fail-closed 14-day evidence artifact containing logs, tests, coverage, production, and Storybook output |
| Ralph and agentic workflows have a completion contract | Protected check identity plus Ralph failing-pull-request prioritization |
| Infrastructure remains approved and bounded | No Azure resources, zero resource groups, and `$0/month` estimated Azure cost |
| Ralph addresses failing pull requests first | `yarn ralph:prioritize` validates immutable run identity before new issue selection |
