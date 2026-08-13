# Shared v2 activation handoff

Issue #61 commits the complete dormant v2 text tree at `shared-v2-source/`
and its `shared-v2-manifest.json`.

Issue #58 must validate the manifest, materialize each file at its listed
destination, then activate v2 only in a reviewed transaction. It must produce
a fresh matching Azure calibration, protected attestation, and exact-head
fan-in proof before changing required checks.
