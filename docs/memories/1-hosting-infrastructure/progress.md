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
- `infra/main.bicep` is the subscription-scope deployment entry point;
  committed environment values live in `infra/environments/*.bicepparam`.
- Bicep validation uses the exact version in `infra/.bicep-version` through
  `yarn infra:install` and `yarn infra:check`.
- Azure Static Web Apps is declared in `infra/modules/static-web-app.bicep`;
  `frontendDeployment` is the non-secret Vite `dist/` publication contract.
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

## 2026-08-11 — US-002 Create modular Bicep and environment parameters

- Added the subscription-scope `infra/main.bicep` entry point with an explicit
  allowlisted target subscription, deterministic resource group, required
  tags, bounded module composition, and non-secret deployment outputs.
- Added resource-group and foundation modules. The foundation reserves stable,
  environment-aware names for the frontend, application programming interface,
  registry, storage, content delivery, identity, secrets, and monitoring
  resources that later stories will declare.
- Added explicit development and production Bicep parameter files for
  subscription `11213dbd-39fe-46ba-87db-5f5e8c449aed`, `eastus2`, lifecycle,
  ownership, cost allocation, and naming values. The files contain no secret
  values.
- Pinned Bicep command-line interface version `v0.46.1`, enabled strict
  secret-related linter rules, and added cross-platform install and validation
  commands that compile without writing generated templates.
- Documented Microsoft Entra ID and OpenID Connect authentication, explicit
  subscription selection, validation, `what-if`, idempotent deployment, fixed
  deployment naming, outputs, and the prohibition on portal-only resource
  creation.
- Validation: `yarn install:check`, `yarn format:check`, `yarn lint`,
  `yarn policy:check`, `yarn infra:check`, and `git diff --check`.
- No Azure sign-in, validation deployment, `what-if`, resource deployment, or
  live endpoint verification was performed or claimed.

## 2026-08-11 — US-003 Provision Azure Static Web Apps frontend hosting

- Added an idempotent Azure Static Web Apps Standard module using the
  environment's deterministic foundation name, tags, and regional location.
- Kept source integration credential-free: Bicep does not accept a repository
  credential and suppresses generated GitHub workflow creation.
- Made preview staging policy explicit per environment: enabled for development
  and disabled for production.
- Added non-secret subscription outputs for the frontend resource identifier,
  name, generated hostname, direct HTTPS endpoint, and Vite publication
  contract.
- Documented that `yarn build` produces the complete `dist/` artifact and copies
  `public/staticwebapp.config.json` into that directory for publication.
- Documented Microsoft Entra ID and OpenID Connect infrastructure
  authentication, explicit subscription selection, and approved secret
  references for any service-issued content publication credential. No
  credential value is stored or emitted.
- Validation: `yarn infra:install`, `yarn infra:check`, `yarn format:check`,
  `yarn lint`, `yarn policy:check`, `yarn build`, checks for
  `dist/index.html` and `dist/staticwebapp.config.json`, compiled-template
  inspection, and `git diff --check`.
- No Azure sign-in, validation deployment, `what-if`, resource deployment,
  content publication, endpoint reachability check, or live deployment evidence
  was performed or claimed.
