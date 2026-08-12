# Dormant shared reviewer v2 boundary

This directory is the versioned shared reviewer v2 capability boundary. It is
not the active unit-test-reviewer registration in the bootstrap pull request.

The active reviewer remains on the protected-main v1 prompt, schema, policy,
engine configuration, and attested calibration fingerprint so it can review
this bootstrap pull request under the existing required check. The separate
v2 runtime, contract, and registration under `scripts/shared-v2/` and this
directory are retained for the explicit follow-up migration after bootstrap.
Follow-up issue #58 owns that activation.

The real Azure v2 calibration metrics are recorded in the issue memory and
pull request, but its report must not become active until the follow-up
activates this boundary and runs a new matching calibration plus attestation.
