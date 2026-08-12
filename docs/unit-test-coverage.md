# Unit-Test Coverage Baseline

Game Hub measures authored runtime behavior that is intended for deterministic
unit or component tests. `yarn test:coverage` runs the canonical continuous-
integration suite and writes the text report, `coverage/coverage-summary.json`,
and LCOV output.

## Measured surfaces

The reviewed scope is defined in `vitest.config.ts`:

- `src/**/*.{ts,tsx}` measures host routing, catalog, loader, page, and reusable
  component behavior.
- `games/*/src/**/*.{ts,tsx}` measures each game simulation and its tested
  lifecycle adapter. The nested simulation threshold prevents rendering
  adapters from hiding a pure-logic regression.
- `packages/game-contract/src/**/*.{ts,tsx}` measures shared runtime contract
  and deterministic simulation helpers.
- `scripts/generate-game-workspaces.mjs` measures manifest validation,
  discovery, sorting, and generated artifact rendering and writing.

Explicit include patterns make a newly added or currently untested authored
file appear at zero coverage instead of disappearing from the report.

## Justified exclusions

- Test files and `src/test/` are verification infrastructure, not production
  behavior.
- `src/generated/` is generated output whose exact text is tested through the
  generator. Counting generated lines would reward larger generated artifacts.
- `src/storybook/` and `src/stories/` are component-development fixtures and
  catalogs, outside the host runtime measured by this baseline.
- `src/main.tsx` is a side-effect-only browser bootstrap. The production build
  and later browser-level checks own that integration boundary.

Do not add an exclusion to make a threshold pass. A new exclusion requires a
reviewed boundary rationale showing why the file is generated, test-only, or
owned by a different verification layer.

## Reviewed baseline

The baseline was measured on 2026-08-12 after US-001 through US-011:

| Surface | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All measured files | 94.84% | 85.06% | 94.36% | 95.27% |
| Host | 95.88% | 86.29% | 100.00% | 95.65% |
| All game source | 96.47% | 87.86% | 90.52% | 97.39% |
| Pure game simulations | 97.05% | 92.00% | 93.54% | 98.92% |
| Shared contract | 97.43% | 94.73% | 100.00% | 97.43% |
| Workspace generator | 82.40% | 70.27% | 87.50% | 82.07% |

Vitest enforces the global baseline and each surface baseline. The generator's
lower reviewed branch baseline remains visible instead of being excluded or
misrepresented as complete.

## Ratchet procedure

1. Run `yarn test:coverage` from a clean worktree.
2. Inspect the text report and `coverage/coverage-summary.json`. Sort or filter
   the per-file entries to find zero and partially covered files; do not rely
   only on the aggregate row.
3. If coverage falls, add behavior-focused tests or correct the intended source
   scope. Do not lower a threshold, weaken an include, or broaden an exclusion
   merely to restore a passing run.
4. When reviewed tests raise coverage, update the affected surface threshold
   and the global threshold to the reported two-decimal value in the same
   change. Update this table with the new baseline and explain any threshold
   that intentionally remains unchanged.
5. Review include and exclude changes separately from numeric ratchets. New
   authored host, game, contract, or generator files must remain measurable.

Threshold updates are manual so a test run cannot rewrite reviewed policy.
