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
- Azure Container Registry is declared in
  `infra/modules/container-registry.bicep`; its dedicated user-assigned identity
  receives only `AcrPull`, while registry administrative credentials and
  anonymous pull remain disabled.
- The future application programming interface boundary is declared in
  `infra/modules/container-app-api.bicep`; the Container App uses a separate
  system-assigned runtime identity and exposes revision-independent endpoint
  outputs.
- API image, ingress, scaling, allocation, HTTP concurrency, and non-secret
  settings are environment parameters. Secret values remain outside committed
  parameter files; only names of future secure references may be configured.
- Asset storage is declared in `infra/modules/asset-storage.bicep`; the
  dedicated account separates `game-assets`, `media`, and `static-assets`
  through private containers and disables anonymous and Shared Key access.
- Asset publication uses a dedicated user-assigned managed identity with a
  GitHub OpenID Connect federated credential and `Storage Blob Data
  Contributor`; commands use `--auth-mode login`, never keys or Shared Access
  Signatures.
- Asset content delivery is declared in
  `infra/modules/asset-content-delivery.bicep`; Azure Front Door uses a
  system-assigned identity and `Storage Blob Data Reader` to reach the private
  containers, with separate routes and environment-specific cache durations.
- Azure Front Door managed origin authentication currently cannot be combined
  with a Private Link origin. Keep the blob endpoint network reachable while
  anonymous and Shared Key access remain disabled unless Azure adds a supported
  identity-plus-Private-Link path.
- Format Bicep and Bicep parameter files with the pinned
  `az bicep format --file <path>` command; repository Prettier does not parse
  those file types.
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

## 2026-08-11 — US-004 Provision Azure Container Apps API and Azure Container Registry

- Added a bounded Azure Container Registry Basic module with deterministic
  naming, administrative credentials disabled, anonymous pull disabled, and a
  stable private repository output for the future API image.
- Created a dedicated user-assigned image-pull identity and granted it only the
  built-in `AcrPull` role at registry scope through a deterministic role
  assignment.
- Added a consumption-only Azure Container Apps environment and a
  single-revision Container App with configurable image, external ingress,
  target port, transport, replica bounds, CPU, memory, HTTP concurrency,
  non-secret environment variables, and named secure-reference placeholders.
- Kept workload permissions separate from image retrieval: the Container App
  has a system-assigned runtime identity with no data-plane roles in this
  story, while the pull-only identity is used exclusively by the registry
  configuration.
- Added explicit development defaults that scale to zero and production
  defaults with one warm replica. Both environments use a digest-pinned public
  bootstrap image until OpenID Connect-federated publication automation pushes
  the future API image to the private repository.
- Added non-secret outputs for the registry, login server, private repository,
  pull identity and role assignment, Container Apps environment, Container
  App, stable diagnostic hostname and endpoint, runtime principal, and API
  deployment contract.
- Documented the bootstrap-image evidence boundary, direct diagnostic endpoint,
  future canonical ingress, Microsoft Entra workload identity publication,
  secret-reference policy, identity separation, cost defaults, and output
  contract.
- Validation: `yarn infra:install`, `yarn infra:check`, compiled-template
  contract inspection, `yarn format:check`, `yarn lint`, `yarn policy:check`,
  `yarn build`, and `git diff --check`.
- No Azure sign-in, validation deployment, `what-if`, resource deployment,
  image publication, endpoint reachability check, or live deployment evidence
  was performed or claimed.

## 2026-08-11 — US-005 Provision blob assets and content delivery

- Added a dedicated general-purpose v2 storage account with explicitly private
  `game-assets`, `media`, and `static-assets` containers, Microsoft Entra ID as
  the default authorization mode, Shared Key and anonymous access disabled,
  Transport Layer Security 1.2, infrastructure encryption, and bounded
  environment-specific soft-delete retention.
- Made cost and resilience values explicit: development uses locally redundant
  storage, seven recovery days, and shorter edge caches; production uses
  zone-redundant storage, fourteen recovery days, a one-year immutable game
  asset cache, a one-hour media cache, and a one-day static asset cache.
- Created a publication-only user-assigned managed identity with a GitHub
  OpenID Connect federated credential scoped to the matching repository
  environment and `Storage Blob Data Contributor` on the dedicated asset
  account. Upload targets expose only account, container, identity, and
  `--auth-mode login` contracts.
- Added Azure Front Door Premium content delivery with a system-assigned
  identity, `Storage Blob Data Reader`, Microsoft Entra origin authentication,
  HTTPS-only origin forwarding, compression, query-string-independent caching,
  and isolated routes for all three content categories.
- Corrected the architecture decision after verifying current Azure behavior:
  Front Door managed origin authentication does not support Private Link
  origins. The storage public endpoint remains network reachable, but anonymous
  and Shared Key authorization cannot read the private containers.
- Added non-secret storage, container, publisher identity, role assignment,
  upload target, Front Door profile, endpoint, public category URL, and caching
  outputs. Updated deployment documentation with subscription-bound Microsoft
  Entra upload commands and an explicit evidence boundary.
- Validation: `yarn infra:install`, `yarn infra:check`, compiled-template
  contract inspection for storage hardening, containers, identities, role
  assignments, federated credentials, origin authentication, routes, caching,
  and outputs; credential-pattern scanning; `yarn format:check`, `yarn lint`,
  `yarn policy:check`, `yarn build`, and `git diff --check`.
- No Azure sign-in, validation deployment, `what-if`, resource deployment,
  asset upload, cache purge, endpoint reachability check, or live deployment
  evidence was performed or claimed.
