# Progress

## Bootstrap

- Issue #58 starts from `e3d25cdb8f63e8ccd4652439d5e95ee050bb8d7b`,
  which merged the reviewable dormant v2 source tree.
- Execution is continuously authorized by best judgment until the draft pull
  request is ready. This loop never merges.
- The v1 unit-test reviewer remains the protected-main reviewer for this
  activation pull request. Activated v2 execution begins only after merge.

## Constraints

- Preserve `Adversarial Review / unit-test-reviewer` as the required-check
  identity.
- Do not enable Gilfoyle.
- A new real Azure calibration must bind to the activated fingerprint; the
  dormant calibration report is not promotion evidence.
- Issue #22 supplies the first representative protected-main v2/fan-in proof.
  Do not claim v2 promotion identity before #22 passes.

## Activation transaction

- **US-001 red/green:** `yarn vitest run
  scripts/activate-shared-v2.test.mjs --coverage.enabled=false` first failed
  at the activation-command seam, then passed after deterministic source digest,
  external-dependency, destination-safety, and rollback handling were added.
- **US-002:** The transaction materialized the active prompt, registry, schema,
  policy, engine, runtime, publisher, matrix, fan-in, waiver, and promotion
  files. The active collector no longer contains the retired inert-evidence
  exclusion; the historical source tree stays as reviewable inactive evidence.
  The unit-test required-check name is unchanged and Gilfoyle remains absent
  from the enabled matrix.
- **US-003:** A fresh Azure calibration, generated
  `2026-08-13T08:16:45.282Z` for fingerprint
  `24725a4daba4d1422cefe08e3f6a6ebd9818339b1993981cbde949eae27d4add`,
  passed unchanged strict thresholds: detection `1.0`, strong false-positive
  `0`, missed critical `0`, agreement `1.0`, error `0`, p95 `15357ms`, average
  cost `$0.001788`, and `125095` tokens. The dormant report was removed from
  the activation manifest and was not used as promotion evidence.
- **US-004:** The v2 workflow publishes fan-in after the preserved
  `Adversarial Review / unit-test-reviewer` check. #22 is explicitly the first
  representative protected-main v2/fan-in proof; required-check ratcheting and
  Gilfoyle activation remain out of scope.
- **Final local gates:** format, lint, typecheck, full policy,
  `shared-v2:check`, 410 deterministic tests, and 23 fail-closed probes pass.
