# Shared v2 activation handoff

Issue #59 commits the reviewable dormant v2 tree at
`shared-v2-source/` with the adjacent `shared-v2-manifest.json`.

Issue #58 must:

1. run `yarn shared-v2:check`;
2. materialize the manifest files at their listed destinations in a reviewed
   activation transaction;
3. switch the active v1 registration/workflow only after that materialization;
4. produce a fresh matching Azure calibration and protected attestation; and
5. prove the v2 exact-head reviewer and fan-in from protected `main`.

The v1 required reviewer remains active until that activation PR is reviewed.
