# Issue #58 — Activate unit-test reviewer shared v2 contract after bootstrap

URL: https://github.com/jdylanmc/game-hub/issues/58

## Goal

Explicitly activate the complete committed shared reviewer v2 text tree from
#61 after its v1 bootstrap path has merged.

## Required work

- Validate and materialize the committed source tree described by
  `docs/memories/56-shared-adversarial-reviewer-platform/shared-v2-manifest.json`
  into its listed runtime destinations.
- Switch the active unit-test reviewer registration and protected-base workflow
  from v1 to the materialized v2 deliverables in one explicit transaction.
- Promote the v2 prompt, schema, policy, engine, runtime, publisher,
  matrix/fan-in, waiver, and promotion behavior together.
- Run a fresh real Azure calibration against the activated v2 fingerprint and
  produce protected attestation when policy requires it.
- Prove exact-head v2 reviewer and fan-in checks from protected `main`; do not
  reuse v1 calibration evidence.

## Safety

Keep v1 execution active until the explicit activation transaction is reviewed.
Never weaken required checks or branch protection. Keep the required check name
`Adversarial Review / unit-test-reviewer` for identity continuity. Do not enable
Gilfoyle. Issue #22 is the first representative protected-main proof for v2
fan-in; v2 promotion identity is unproven until #22 passes.
