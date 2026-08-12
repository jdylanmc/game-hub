# Dormant v2 runtime boundary

The shared reviewer v2 runtime is intentionally not executable in the
bootstrap pull request. The active protected-main v1 reviewer must review this
pull request without consuming a large v2 source payload as untrusted
evidence.

Follow-up issue #58 restores the v2 runtime from this branch history, activates
the manifest in `config/adversarial-agents/shared-v2/`, recalibrates it, and
proves its exact-head fan-in behavior from protected `main`.
