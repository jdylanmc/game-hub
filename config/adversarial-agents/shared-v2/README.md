# Dormant shared reviewer v2 boundary

This directory is the versioned shared reviewer v2 capability boundary. It is
not the active unit-test-reviewer registration in the bootstrap pull request.

The active reviewer remains on the protected-main v1 prompt, schema, policy,
engine configuration, and attested calibration fingerprint so it can review
this bootstrap pull request under the existing required check. The versioned v2 activation manifest in this directory is retained as the
reviewable contract boundary. Full v2 execution source remains in this
bootstrap branch history but is deliberately not copied into the pull-request
evidence set; copying it caused the current v1 protected reviewer to exhaust
its bounded evidence budget before review. Follow-up issue #58 owns restoring
and activating that runtime after bootstrap.

The real Azure v2 calibration metrics are recorded in the issue memory and
pull request, but its report must not become active until the follow-up
activates this boundary, restores the v2 runtime from the bootstrap history,
and runs a new matching calibration plus attestation.
