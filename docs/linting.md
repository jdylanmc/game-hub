# Repository Linting

Game Hub uses one versioned root ESLint flat configuration for authored
JavaScript and TypeScript. The same commands, dependencies, scope checks, and
zero-warning policy run locally, in the Ralph Loop, and in the protected
`Continuous integration` check.

## Local commands

```bash
yarn lint
yarn lint:fix
```

Both commands first run `yarn lint:scope`, which proves that current and future
game and package workspaces remain discoverable and that excluded output stays
untouched. `yarn lint` then runs ESLint with `--max-warnings 0`.
`yarn lint:fix` uses the same configuration and warning policy with ESLint's
`--fix` option.

Formatting is deliberately separate:

```bash
yarn format
yarn format:check
```

`lint:fix` applies only fixes supplied by enabled ESLint rules. It does not run
Prettier or the game and Mamba generators. The deterministic lint proof applies
a supported import-order fix, reruns `yarn lint`, and verifies generated,
imported, and unrelated repository files remain byte-identical.

## Shared configuration decisions

`eslint.config.js` is the only lint configuration. Root `package.json` and
`yarn.lock` pin ESLint `9.39.5`, TypeScript ESLint `8.66.0`, React `7.37.5`,
React Hooks `7.1.1`, JSX accessibility `6.10.2`, Import X `4.17.1`, the
TypeScript import resolver `4.4.5`, Promise `7.3.0`, and globals `17.9.0`.
No global lint installation participates in the result.

The enabled rule families are:

- ESLint recommended JavaScript correctness and unused-code rules;
- TypeScript ESLint type-checked correctness, unsafe-value, unused-code,
  floating-promise, and misused-promise rules;
- React recommended and JSX-runtime rules;
- React Hooks recommended rules;
- JSX accessibility recommended rules, with `Link` and `Button` mapped to
  their rendered native elements; and
- Import X resolution, export, duplicate, default-import, and import-order
  rules.

The standalone Promise plugin remains pinned as part of the reviewed toolchain,
but its preset is not layered over TypeScript source. TypeScript ESLint's
type-aware promise rules provide the enforced promise diagnostics without
duplicating or weakening them.

Narrow overrides resolve known tool boundaries. TypeScript owns named-import
validation. Namespace-like default exports used by ESLint and the Mamba
generator disable only the conflicting Import X checks. Schema-driven
adversarial tools disable a listed set of unsafe-value rules only at their
explicit runtime-validation boundary; promise, import, call, and general
correctness rules remain active.

## Environment boundaries

| Surface | Applied environment |
| --- | --- |
| Authored JavaScript, MJS, and CJS | ESLint recommended rules and Node.js globals |
| Authored TypeScript and TSX | TypeScript project-service type information and type-checked rules |
| `src/`, game source, and Storybook preview | Browser globals |
| Root TypeScript configuration, Storybook main, and TypeScript scripts | Node.js globals |
| Tests | Browser and Vitest globals |
| Host source and Storybook stories or preview | React, React Hooks, JSX runtime, and accessibility rules |
| Shared package source | TypeScript and import rules without browser or React globals |

`tsconfig.app.json`, `tsconfig.node.json`, and `scripts/tsconfig.json` keep every
authored TypeScript surface available to the project service without adding
standalone operational tools to the application build.

## Workspace coverage and exclusions

Repository-wide globs cover host source, Storybook, tests, scripts,
configuration, generators, handwritten wrappers, every current game, and every
current package. `scripts/check-lint-scope.mjs` creates representative complete
workspaces under both `games/` and `packages/` and requires their violations to
appear through the canonical command. A future workspace therefore cannot rely
on a missing per-workspace lint script to bypass the root gate.

Only non-authored or generated output is excluded:

- Yarn and dependency directories;
- coverage, test results, `dist`, and `storybook-static` output at any
  workspace depth;
- generated game manifest and import-map output;
- generated Mamba data and stories; and
- imported Mamba source snapshots.

The generator and handwritten Mamba wrappers remain linted. The scope proof
writes fixable sentinels under every exclusion boundary and requires them to
remain byte-identical after fix-mode evaluation.

ESLint is the code linter. Prettier remains the formatting gate for Markdown,
JSON, YAML, and other supported text. Workflow YAML additionally has
fail-closed policy validation. There is no Bicep source today; the first
infrastructure change must add its pinned validation contract. Existing shell
entry points are covered by their executable tests and workflow policy rather
than being passed to ESLint.

## Suppression approval

Inline suppressions are exceptional reviewed policy changes. Use only
`eslint-disable-next-line` immediately before one affected line or
`eslint-disable-line` on that line, name exactly one rule, and include a
specific durable reason after ` -- `. Add one exact matching approval to
`config/lint-suppressions.json`.

`yarn lint:suppressions` rejects unapproved, broad, multi-rule, duplicate,
stale, reasonless, transient, mismatched, or inexact suppressions. See
[Continuous Integration](continuous-integration.md#eslint-suppression-review)
for the approval schema and example.

## Pull request #32 baseline versus issue #27

Merged pull request
[#32, High-Assurance GitHub Actions CI Gates](https://github.com/jdylanmc/game-hub/pull/32),
established the baseline used by this issue:

- the first pinned ESLint, TypeScript ESLint, React, React Hooks, and globals
  dependencies;
- root `yarn lint` with one flat configuration and zero allowed warnings;
- initial repository code coverage and generated, imported, dependency,
  coverage, and build exclusions;
- the initial exact suppression allowlist;
- lint execution and retained output in `Continuous integration`; and
- one isolated unused-variable failure proof under the composite required
  check.

Issue #27 adds and verifies the complete repository lint contract:

- root `yarn lint:fix` and deterministic safe-fix evidence;
- JSX accessibility, Import X, TypeScript import resolution, and the pinned
  Promise toolchain dependency;
- TypeScript project-service rules for unsafe values, promises, correctness,
  and unused code;
- targeted browser, Node.js, test, Storybook, React, package, game, generator,
  configuration, and operational-script boundaries;
- automatic new-game and new-package discovery proofs plus exclusion
  sentinels;
- parsed, reasoned, one-rule, line-scoped suppression approval with accepted
  and rejected policy tests;
- isolated actionable proofs for every required rule family, warnings,
  environments, and safe fixes; and
- workflow policy and an exact `pipefail`/`yarn lint`/`tee` failure simulation
  that bind local, Ralph, continuous integration, retained evidence, and branch
  protection to the same command.

## Issue #27 evidence reconciliation

The exact pull-request head must pass local `yarn validate`, the genuine
`Continuous integration` check, and
`Adversarial Review / unit-test-reviewer`. The pull request check rollup is the
authoritative exact-head publication evidence.

### Requirements

| Issue requirement | Current implementation and passing evidence |
| --- | --- |
| Root lint command covers every applicable surface | `yarn lint` runs `lint:scope` and the root flat configuration; `yarn validate` and exact-head continuous integration run it. |
| TypeScript-aware React, browser, Node.js, generator, and game linting | Project-service configuration and targeted overrides; `yarn test:lint` proves typed and environment-specific diagnostics. |
| Hooks, accessibility, import, promise, unused, correctness, and unsafe rules | Enabled rule families above; isolated structured-diagnostic probes in `scripts/prove-lint-behavior.mjs`. |
| Root safe-fix command | `yarn lint:fix`; the live fix proof applies `import-x/first`, reruns lint, and checks byte snapshots. |
| One shared versioned configuration | Root `eslint.config.js`; `yarn policy:workflow` rejects canonical script or dependency drift. |
| New workspaces included automatically | `lint:scope` creates and rejects violations in representative new game and package workspaces. |
| Generated Mamba output excluded while generators and wrappers remain linted | Exact ignores plus linted-path and fix-sentinel checks in `lint:scope`. |
| Formatting separation documented | The local command section above and separate `format`/`format:check` gates. |
| Warnings fail continuous integration | `--max-warnings 0`; `yarn test:lint` proves a warning makes the canonical command nonzero. |
| Tool versions pinned through Yarn | Exact root development dependencies and immutable `yarn.lock`; workflow policy rejects ranges or drift. |

### Pull-request integration

| Issue requirement | Current implementation and passing evidence |
| --- | --- |
| Run on every pull request and protected-branch update | The continuous integration workflow triggers for pull requests and `main` updates and invokes `yarn lint`. |
| Required lint failure blocks merge | Strict branch protection requires the composite `Continuous integration` check; the fail-closed proof injects a lint violation into its exact pipeline. |
| Actionable file and line output | Structured lint proofs require file, line, column, severity, and rule; workflow evidence retains `lint.log`. |
| Local and continuous integration use identical configuration and dependencies | Both run root `yarn lint` after immutable Yarn installation; policy rejects alternatives. |
| Ralph and future agentic workflows share the gate | The iteration contract requires canonical lint, lint proofs, and policy; agentic workflows must consume the protected result rather than substitute direct ESLint. |

### Acceptance criteria

| Acceptance criterion | Current passing evidence |
| --- | --- |
| `yarn lint` passes and representative violations return nonzero | Final `yarn validate`, exact-head continuous integration, and the exact-rule `yarn test:lint` probes. |
| `yarn lint:fix` safely fixes supported issues | The import-order fix passes post-fix lint while generated, imported, and unrelated byte snapshots remain unchanged. |
| Website, shared contract, games, Storybook, and scripts are covered | `lint:scope` verifies representative files in every surface and the root lint run passes. |
| New workspaces cannot silently bypass linting | Complete temporary game and package workspace probes must fail for their intended unused-code violations. |
| The required pull-request check blocks lint failures | The exact workflow pipeline failure probe and strict live branch protection bind lint to `Continuous integration`. |
| Decisions, suppressions, exclusions, and local usage are documented | This document and the suppression section of the continuous integration contract. |
| Inline suppressions require a reason and narrow scope | Parsed source policy plus accepted and rejected suppression tests in `yarn test:lint` and `yarn policy:check`. |

### Open design decisions resolved

| Decision | Resolution |
| --- | --- |
| ESLint and plugin set | Exact pinned versions and enabled rule families documented above. |
| Formatting | Prettier is a separate required gate; `lint:fix` is not a formatter. |
| Warning and Mamba policy | Zero warnings. Generated and imported Mamba snapshots are excluded; generators and handwritten wrappers are linted. |
| Bicep, workflow YAML, Markdown, JSON, and shell | ESLint owns JavaScript and TypeScript. Prettier and domain policy cover text/configuration; workflow YAML has explicit policy checks; future Bicep must add pinned validation; shell entry points retain executable tests and policy coverage. |
