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

`yarn validate` and `.github/workflows/continuous-integration.yml` run these
canonical root commands in the same order:

| Command | Expected output |
| --- | --- |
| `yarn install:check` | Immutable installation succeeds without changing `yarn.lock`. |
| `yarn format:check` | Prettier reports all covered files formatted. |
| `yarn lint` | ESLint completes with zero errors and zero warnings. |
| `yarn policy:check` | Lint suppressions are approved and workflow and Code Owner invariants remain intact. |
| `yarn test:ci-fail-closed` | All 11 representative failure probes fail for their expected reason. |
| `yarn security:audit` | The recursive dependency audit reports no high-severity findings; an unavailable registry fails the command. |
| `yarn test:coverage` | Test integrity, Ralph orchestration simulations, deterministic Vitest execution, JUnit output, and configured coverage thresholds pass. |
| `yarn generate:check` | Workspace generation leaves the committed manifest and import map unchanged and clean. |
| `yarn typecheck` | All TypeScript project references compile without emitting errors. |
| `yarn build` | `dist/` contains the production website and Vite manifest. |
| `yarn bundle:check` | Entry, asynchronous chunk, JavaScript, stylesheet, and total raw-byte budgets pass. |
| `yarn build-storybook` | `storybook-static/` contains the browser-renderable Storybook build. |

The workflow runs each command directly rather than invoking a different
continuous-integration-only implementation. It pipes output to retained logs
without suppressing the command's exit status.

## Fail-closed enforcement

- Test integrity requires deterministic suites under `src/`, `games/`, and
  `packages/`; rejects focused, skipped, todo, and quarantined tests; and
  disallows empty suites.
- Vitest shuffles tests with seed `29005` and enforces 85% line, function, and
  statement coverage plus 75% branch coverage over the configured host surface.
- `config/lint-suppressions.json` is the reviewed allowlist for exceptional
  ESLint suppressions. New unapproved directives fail `yarn policy:check`.
- `config/bundle-budgets.json` defines reviewed raw-byte limits. Missing build
  output and unexplained entry, chunk, JavaScript, stylesheet, or total
  regressions fail `yarn bundle:check`.
- `yarn policy:check` rejects missing mandatory commands or evidence, weakened
  triggers, permissions, concurrency, timeout, action pinning, artifact
  retention, or Code Owner rules.
- `yarn test:ci-fail-closed` uses an isolated detached worktree to prove that
  formatting, lint, type, test, generation, production build, bundle budget,
  missing build output, missing workflow command, unavailable security audit,
  and Storybook browser-build failures cannot complete successfully.

The required job has a 30-minute timeout and concurrency cancellation enabled.
An error, cancellation, timeout, stale generated output, unavailable mandatory
service, missing required artifact, or absent required check cannot produce a
mergeable pull request. There are no retries, `continue-on-error` gates, or
warning-only fallbacks.

## Permissions, forks, and retained evidence

The workflow grants only `contents: read`, uses `pull_request` rather than
`pull_request_target`, disables persisted checkout credentials, and does not
consume secrets. Fork pull requests therefore run the same unprivileged
contract as repository branches. Every action is pinned to a full commit SHA,
and the runner and Node.js version are pinned.

The workflow uploads one
`continuous-integration-evidence-<run-id>-<attempt>` artifact for 14 days, even
after a failed gate. Missing evidence makes artifact upload fail. It contains:

- per-gate logs, including dependency-security audit and fail-closed proof;
- JUnit test results and coverage reports;
- the production `dist/` output; and
- the static `storybook-static/` browser output.

## Merge and autonomous completion

The live `main` protection described in
[Branch Protection](branch-protection.md) requires the
`Continuous integration` check from GitHub Actions app ID `15368` on a branch
that is current with `main`. A missing, pending, failed, canceled, or stale
check blocks merge. One non-last-pusher approval, Code Owner review for
workflow changes, stale-review dismissal, and resolved conversations prevent a
workflow change from self-approving reduced protection.

Ralph checks open Ralph pull requests with `yarn ralph:prioritize` before
ranking new issues. A failed or absent check is routed to its uniquely matched
issue memory, branch, and draft pull request; ambiguous ownership stops the
loop. Ralph and GitHub Agentic Workflows may treat the protected
`Continuous integration` result as completion evidence, but neither may bypass
the review or merge requirements.

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
| Representative failures block completion | Eleven isolated probes in `scripts/prove-ci-fail-closed.mjs` |
| Forks need no privileged credentials | Read-only permissions, no secrets, no persisted checkout credentials, and no `pull_request_target` |
| Workflow protection cannot self-approve weakening | Code Owner review, non-last-pusher approval, and policy-checked ownership and workflow invariants |
| Outputs and security evidence have defined retention | Fail-closed 14-day evidence artifact containing logs, tests, coverage, production, and Storybook output |
| Ralph and agentic workflows have a completion contract | Protected check identity plus Ralph failing-pull-request prioritization |
| Infrastructure remains approved and bounded | No Azure resources, zero resource groups, and `$0/month` estimated Azure cost |
| Ralph addresses failing pull requests first | `yarn ralph:prioritize` validates immutable run identity before new issue selection |
