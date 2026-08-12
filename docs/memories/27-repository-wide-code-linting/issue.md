# Issue #27: Repository-Wide Code Linting

- Repository: `jdylanmc/game-hub`
- URL: https://github.com/jdylanmc/game-hub/issues/27
- State: Open
- Labels: `priority:P0`, `type:non-functional`, `area:website`

## Goal

Establish mandatory, consistent code linting across the Game Hub website,
shared packages, game workspaces, Storybook, scripts, tests, and
infrastructure-supporting source files.

## Requirements

- Add a root `yarn lint` command that checks every applicable workspace and
  source surface.
- Use TypeScript-aware linting for React, browser, Node.js, generator, and game
  code.
- Enforce React hooks, accessibility, import, promise, unused-code,
  correctness, and unsafe TypeScript rules appropriate to each environment.
- Provide a root `yarn lint:fix` command for safely auto-fixable findings.
- Apply one versioned shared configuration with targeted overrides rather than
  unrelated per-workspace configurations.
- Include newly added game and package workspaces automatically.
- Exclude generated Mamba snapshots and build outputs only where linting would
  be meaningless; continue linting the generator and handwritten wrappers.
- Keep formatting concerns clearly separated or deliberately integrated and
  documented.
- Fail on warnings in continuous integration unless an explicitly documented
  baseline policy is approved.
- Pin tool versions through Yarn and avoid globally installed lint
  dependencies.

## Pull-request integration

- Run linting on every pull request and protected-branch update.
- Make the lint check required before merge.
- Produce actionable file and line output.
- Ensure local and continuous-integration commands use the same configuration
  and dependency versions.
- Integrate the command into Ralph and future Agentic Workflow quality gates.

## Acceptance criteria

- `yarn lint` passes on the baseline repository and returns nonzero for
  representative violations.
- `yarn lint:fix` fixes supported issues without modifying generated or
  unrelated content unexpectedly.
- Website, shared contract, all game workspaces, Storybook, and scripts are
  covered.
- New workspaces cannot silently bypass linting.
- The required pull-request check blocks merging on lint failures.
- Configuration decisions, suppressions, generated-code exclusions, and local
  usage are documented.
- Inline suppressions require a reason and are limited to the narrowest
  practical scope.

## Open design decisions

- ESLint version and exact plugin set.
- Formatting tool and whether formatting is a separate required check.
- Initial warning policy and treatment of imported Mamba source snapshots.
- Linting for Bicep, workflow YAML, Markdown, JSON, and shell scripts.

## Existing implementation to reconcile

Merged pull request #32, `High-Assurance GitHub Actions CI Gates`, introduced a
baseline ESLint command, shared flat configuration, pinned lint dependencies,
zero-warning continuous integration execution, suppression policy, exclusions,
and one representative lint failure proof. Issue #27 remains open because the
current implementation does not yet demonstrate all acceptance criteria,
including `lint:fix`, type-aware unsafe and promise rules, accessibility and
import enforcement, precise environment overrides, workspace-bypass proofs,
reasoned inline suppressions, and representative safe-fix evidence.
