# Shared reviewer v2 dormant boundary

This complete, fingerprinted v2 implementation is committed for follow-up
activation. Bootstrap deliberately leaves the active reviewer on v1 so the
current protected-main reviewer can publish its required exact-head check.

Validate the manifest with `yarn shared-v2:check`. The check verifies every
recorded file digest and confirms the active v1 workflow does not reference the
dormant boundary. Only issue #58 may activate it after a fresh matching Azure
calibration, protected attestation, and fan-in proof.
