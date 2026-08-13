# Progress

## Bootstrap

- #57 merged as `869fe91c5db844b992cee5e7524450bc07191c7a`.
- #60 merged as `c693937b7b568d991f9437236763df88c9bed37e`.
- The active collector now provides the exact inert metadata-only path needed
  to review this payload without consuming its patch source text.

## Completion

- **US-001:** Recovered the reviewed v2 runtime, configuration, helpers, and
  historical tests from the #56 branch into normal text at the exact inert
  path. Every source has an intended activation destination.
- **US-002:** Added a manifest checker that validates source hashes,
  destination/source uniqueness and safety, aggregate digest, relative import
  and config-read closure, external dependency hashes, symlink safety, and
  active-v1 isolation.
- **US-003:** Added activation smoke coverage that materializes the text tree
  in a fixture, verifies registry/policy hashes, typechecks the v2 runtime,
  and proves active v1 files remain unchanged.
- **US-004:** Added the durable #56 activation handoff; #58 now consumes
  committed main-branch text only.
- **Collector retry fix:** protected-main collection initially blocked the
  inert tree because the active lint-scope policy probe held a literal inert
  path. The probe is now built from inert path segments, so it remains a
  non-executing lint assertion rather than an apparent activation reference.
  Its public collector seam was driven red with
  `yarn vitest run scripts/collect-adversarial-context.test.mjs --coverage.enabled=false -t 'allows the lint-scope policy probe'`
  (`BLOCKED` before the fix), then green with the same command (`READY`).
- **Validation:** `yarn format:check`, `yarn lint`, `yarn typecheck`,
  `yarn policy:check`, `yarn shared-v2:check`, the targeted v2/collector
  suite, `yarn test` (380 deterministic tests), and
  `yarn test:ci-fail-closed` (23 probes) pass locally.
