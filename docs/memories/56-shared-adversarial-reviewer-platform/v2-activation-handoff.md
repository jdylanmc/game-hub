# Shared v2 activation handoff

Issue #61 commits the complete dormant v2 text tree at `shared-v2-source/`
and its `shared-v2-manifest.json`.

Issue #58 must validate the manifest, materialize each file at its listed
destination, then activate v2 only in a reviewed transaction. It must produce
a fresh matching Azure calibration before changing required checks. Unit-test
reviewer attestation is not a substitute for the Gilfoyle-specific protected
attestation policy.

Issue #22 is the first representative protected-main proof of v2 reviewer
publication and fan-in. Do not claim v2 promotion identity, add fan-in to
branch protection, or enable Gilfoyle until #22 passes on the activated main
contract.
