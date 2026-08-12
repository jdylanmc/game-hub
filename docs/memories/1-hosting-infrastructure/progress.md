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

## 2026-08-11 — US-001 Document the architecture and cost topology

- Selected Azure Front Door Premium as the canonical protected ingress, Azure
  Static Web Apps Standard for the frontend and authentication boundary, a
  linked Azure Container Apps backend with Azure Container Registry, and
  private blob containers for game assets, media, and other static content.
- Documented trust boundaries, environment defaults, scaling and regional
  choices, cost drivers, least-privilege identity and secret handling,
  observability, required outputs, alternatives, and requirement traceability.
- Explicitly bound every deployment to subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Added `docs/hosting-infrastructure.md` and linked it from `README.md` and
  `docs/architecture.md`.
- Recovered the cancelled prior runner state only after confirming its process
  was gone and the worktree was clean; its lease and checkpoint remain archived
  in Git-local Ralph state.
- Validation: `corepack enable && yarn install --immutable`,
  `yarn format:check`, and `git diff --check`.
- Reusable discovery: Azure Static Web Apps must use Standard to link an Azure
  Container Apps backend; linked backends are unavailable in pull-request
  environments. Azure Front Door Premium is required for both the managed bot
  rule set and Private Link to Blob Storage, while Static Web Apps is locked to
  Front Door with its backend service tag and forwarding-gateway header.
- No Azure resources were deployed, and no live endpoint or deployment evidence
  is claimed.
