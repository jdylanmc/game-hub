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
