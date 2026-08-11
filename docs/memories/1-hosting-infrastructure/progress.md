# Progress

## Codebase Patterns

- Azure infrastructure belongs under `infra/` and must use idempotent Bicep
  with explicit environment parameter or configuration files.
- Deployment automation must explicitly target Azure subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Secret values must not be committed; secure references or deployment-time
  injection supply them.
- The static frontend and future containerized application programming
  interface remain separate deployable boundaries.
- Issue #30 is an orchestration dependency because it currently owns
  overlapping `infra`, `.github`, and policy surfaces.

## 2026-08-11 — Memory preparation

- Snapshotted live GitHub issue #1 without expanding its requirements or
  acceptance criteria.
- Planned nine bounded stories covering architecture and cost topology,
  modular Bicep and environment parameters, frontend hosting, the containerized
  backend and registry, blob assets and content delivery, authentication
  readiness, public ingress protection, identities and operations, and
  deployment verification.
- Recorded continuous continuation by best judgment as explicitly delegated.
- No infrastructure was implemented or deployed, and no live acceptance
  evidence is claimed.
