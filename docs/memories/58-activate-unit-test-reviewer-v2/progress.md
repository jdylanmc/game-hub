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

## Ratcheted staging slice

- The complete activation diff calibrated successfully but the immutable
  protected-main v1 collector exhausted its 786,432-byte evidence budget
  before inference. This PR is now a side-by-side staging slice; it leaves
  active v1 workflow, registry, runtime, configuration, and calibration
  untouched.
- **US-001 red/green:** `test:shared-v2` initially rejected the staged
  registry because it referenced active v1 collector configuration. The staged
  registry now points to its own reviewed collector config and the command
  passes without activating runtime.
- This slice stages the v2 result validator, reviewer engine/critic/persona/
  retry core, evaluator and calibration support, schema/policy/engine/context
  config, prompt, and focused fixture test. The next slice must stage
  publisher, matrix, fan-in, waiver, and promotion modules before the final
  small activation transaction.
- The current v1 collector accepted the committed staging head as `READY` at
  `730740` consumed evidence bytes, below its immutable `786432`-byte limit.
