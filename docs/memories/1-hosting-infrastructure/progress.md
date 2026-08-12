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
  user-assigned runtime identity for workload access, a pull-only identity for
  the registry, and its platform system-assigned identity. It exposes
  revision-independent endpoint outputs.
- API image, ingress, scaling, allocation, HTTP concurrency, and non-secret
  settings are environment parameters. Secret values remain outside committed
  parameter files; only Container Apps aliases and versionless Key Vault URIs
  may be configured.
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
- Authentication readiness is declared in
  `infra/modules/authentication-readiness.bicep`. Azure Static Web Apps owns
  the keyless Microsoft Entra OpenID Connect flow, `/api/*` requires the
  `authenticated` role, and the linked Container App is the only trusted
  browser API path.
- The Static Web App has a system-assigned identity. The Container App has a
  dedicated user-assigned runtime identity plus a platform system-assigned
  identity. Keep them separate from registry pull, asset publication, and
  secure-configuration publication identities.
- `scripts/check-authentication-infrastructure.mjs` is part of
  `yarn infra:check` and fails closed if the managed identity, keyless provider,
  linked backend, route roles, trust boundary, outputs, or credential
  prohibition regress.
- `infra/modules/public-ingress.bicep` extends the existing Azure Front Door
  Premium profile rather than creating another edge. Its security policy
  associates one WAF with `/*` so frontend, authentication, API, and asset
  routes receive the same managed default and bot rules.
- Development starts with WAF detection mode and higher tuning thresholds;
  production uses prevention mode. API, authentication, and general rate
  limits use explicit environment parameters and a five-minute socket-IP
  window.
- `frontendDeployment.forwardingGatewayConfiguration` supplies the generated
  Front Door hostname, Front Door ID, and `AzureFrontDoor.Backend` restriction
  that frontend publication must merge into `staticwebapp.config.json`. Until
  that post-deployment publication occurs, the Static Web Apps hostname is a
  diagnostic WAF bypass and is not production-ready.
- `scripts/check-public-ingress-infrastructure.mjs` is part of
  `yarn infra:check` and fails closed if the Premium profile, all-path WAF
  association, managed rules, rate limits, environment modes, protected path
  mapping, forwarding-gateway contract, canonical authentication hostname, or
  credential prohibition regresses.
- `infra/modules/secure-configuration.bicep` owns the environment Key Vault,
  API runtime identity, publication-only identity, immutable GitHub federation,
  and the scoped Key Vault Secrets User and Key Vault Secrets Officer role
  assignments. It declares no vault secret resources.
- `infra/modules/observability.bicep` routes platform diagnostics to a
  per-environment Log Analytics workspace through Azure Monitor and creates
  workspace-based Application Insights without retrieving a workspace key.
  Retention, sampling, and the workspace daily ingestion cap are environment
  parameters.
- Hosting workflow federation uses the immutable subject
  `repo:jdylanmc@6954990/game-hub@1330993568:environment:<environment>`.
- Keep `infra/main.bicep` outputs grouped when possible; Azure Resource Manager
  limits a template to 64 outputs.
- A hardened fresh-worktree install can expose normalized executable metadata
  that a populated worktree misses. Refresh only lock metadata with
  `YARN_ENABLE_GLOBAL_CACHE=0 YARN_ENABLE_HARDENED_MODE=1 yarn install
  --mode=update-lockfile`, review the lock-only diff, and rerun the complete
  fail-closed validation.
- `scripts/check-operational-infrastructure.mjs` is part of `yarn infra:check`
  and fails closed if managed identities, vault roles, unresolved runtime
  references, diagnostics, environment guardrails, immutable federation,
  non-secret outputs, or credential prohibitions regress.
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

## 2026-08-12 — Protected-check refresh after main merge

- Fetched and merged `origin/main` at `53aa66a` without rebasing or
  force-pushing. The add/add `infra/README.md` conflict retained both the Game
  Hub hosting guidance and the adversarial-review infrastructure guidance.
- Published merge head `1b3add8`. Genuine pull-request continuous integration
  ran on that exact commit and failed because issue #1's reviewed
  `docs/architecture.md` changes intentionally invalidated the promoted
  adversarial calibration fingerprint.
- Selected Azure subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed` explicitly and ran the repository's
  real Azure calibration through Microsoft Entra ID. The refreshed report is
  promotable with full blocking-pattern detection, no false positives, no
  errors, and agreement across both required repetitions.
- Added `Adversarial Review / unit-test-reviewer` to the issue publication
  contract now supplied by the protected main-branch workflow.
- No Azure infrastructure or application deployment was performed.

## 2026-08-12 — US-006 Make the topology authentication-ready

- Enabled the system-assigned managed identity on the existing Azure Static Web
  App without changing its hosting service or public artifact contract.
- Added `infra/modules/authentication-readiness.bicep`. It declaratively links
  the existing Container App as the production Static Web Apps backend and
  emits a non-secret Microsoft Entra ID/OpenID Connect contract for the
  frontend and API.
- Configured friendly Microsoft Entra login and platform logout routes, blocked
  the unused GitHub provider, and required the built-in `authenticated` role
  for `/api/*`.
- Fixed the browser API boundary at the Static Web Apps same-origin `/api`
  proxy. The Container App's direct hostname remains diagnostic-only, and API
  code receives principal context only from the platform-generated
  `x-ms-client-principal` header inside the linked-backend boundary.
- Exposed the frontend managed identity principal, linked-backend resource,
  authenticated API endpoint, provider paths, role, principal header, API
  runtime identity, and trust-boundary metadata without accepting or emitting
  credentials.
- Added explicit non-secret API environment placeholders for the provider,
  platform principal header, and required role in both committed environment
  parameter files.
- Added `scripts/check-authentication-infrastructure.mjs` to
  `yarn infra:check` plus eight tests covering identity, backend type,
  keyless configuration, API ingress, forbidden credential fields, and
  authenticated route enforcement.
- Updated `AGENTS.md`, `docs/hosting-infrastructure.md`, and `infra/README.md`
  with the durable keyless authentication and authorization boundary.
- Validation: `yarn infra:install`, `yarn infra:check`, targeted authentication
  policy tests, compiled-template contract inspection, credential-pattern
  scanning, `yarn format:check`, `yarn lint`, `yarn policy:check`,
  `yarn test:coverage` (170 tests), `yarn generate:check`, `yarn typecheck`,
  `yarn build`, `yarn bundle:check`, `yarn build-storybook`, and
  `git diff --check`.
- No Azure infrastructure deployment, application deployment, user sign-in,
  linked-backend reachability test, or live authentication-flow verification
  was performed or claimed. US-007 is the next eligible story and was not
  advanced.

## 2026-08-12 — US-007 Protect public ingress from bots and abuse

- Extended the existing Azure Front Door Premium endpoint with an HTTPS-only
  Azure Static Web Apps origin and catch-all frontend route. More-specific
  game asset, media, and static asset routes continue to use the existing
  Microsoft Entra-authenticated Blob Storage origin.
- Added one Azure Front Door WAF policy and one all-path security-policy
  association. Default Rule Set `2.1` and Bot Manager Rule Set `1.1` protect
  `/*`, including the frontend, `/.auth/*`, `/login`, `/logout`, `/api`,
  `/api/*`, `/game-assets/*`, `/media/*`, and `/static-assets/*`.
- Added explicit five-minute custom rate limits per socket IP. Development uses
  detection mode with API/authentication/general thresholds of
  `2000`/`1000`/`10000`; production uses prevention mode with
  `1000`/`500`/`5000`.
- Changed authentication and same-origin API outputs to the canonical Front
  Door hostname while retaining Static Web Apps and Container Apps direct
  endpoints as diagnostic-only contracts.
- Exposed non-secret public endpoint, protected-path mapping, WAF and security
  policy identifiers, Front Door ID, rate-limit contract, and a Static Web Apps
  forwarding-gateway publication object. The latter must be merged into the
  deployed frontend configuration before the origin is considered
  production-ready.
- Documented Premium-profile cost, request and diagnostic cost drivers,
  detection-to-prevention operations, distributed rate-limit behavior,
  shared-IP false-positive risk, threshold calibration, caching boundaries, and
  direct-origin limitations.
- Added fail-closed ingress infrastructure policy validation and seven tests.
- Validation: pinned Bicep formatting and `yarn infra:check`; targeted ingress
  and authentication policy tests; compiled-template inspection; explicit
  Azure subscription selection followed by successful
  `az deployment sub validate` for development; `yarn format:check`,
  `yarn lint`, `yarn policy:check`, `yarn test:coverage` (177 tests),
  `yarn generate:check`, `yarn typecheck`, `yarn build`,
  `yarn bundle:check`, `yarn build-storybook`, `yarn security:audit`, and
  `git diff --check`.
- No Azure resource deployment, frontend publication, application deployment,
  Static Web Apps forwarding restriction, WAF enforcement, bot
  classification, rate-limit event, asset upload, or endpoint reachability was
  performed or claimed. US-008 remains incomplete.

## 2026-08-12 — US-008 Add identities, secrets, observability, and cost controls

- Added one Standard Key Vault per environment with Azure role-based access
  control, soft delete, development cleanup-friendly retention, and production
  purge protection.
- Added a user-assigned API runtime identity with only Key Vault Secrets User
  on its environment vault. Kept the registry pull identity, asset publisher,
  frontend identity, Container Apps platform identity, and runtime identity as
  separate least-privilege boundaries.
- Added a publication-only identity with Key Vault Secrets Officer and an
  immutable GitHub OpenID Connect subject scoped to the matching protected
  environment. Updated asset publication to the same immutable subject format.
- Added Container Apps alias-to-versionless-Key-Vault references and runtime
  environment-variable mappings. Committed environment files keep both arrays
  empty; no secret resource or resolved value is committed or emitted.
- Configured the Container Apps environment to use Azure Monitor rather than a
  Log Analytics workspace key. Added Log Analytics, workspace-based Application
  Insights, and diagnostic settings for Static Web Apps, Container Registry,
  Container Apps system/application boundaries, Blob Storage, Front Door, and
  Key Vault.
- Made the operational defaults explicit: 30-day monitoring retention,
  development/production workspace caps of 1/5 GB per day, Application Insights
  sampling of 100/25 percent, existing API replica ceilings of 2/5, environment
  vault and asset recovery windows, lifecycle, data-classification, and
  cost-profile tags.
- Grouped the Key Vault, managed identity, diagnostic, monitoring, and cost
  guardrail outputs so deployment and application automation receive
  non-secret resource contracts while the subscription template remains below
  Azure Resource Manager's 64-output limit.
- Added `scripts/check-operational-infrastructure.mjs` to `yarn infra:check`
  plus ten fail-closed tests. The complete suite now reports 187 tests.
- Live validation explicitly selected subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`; both development and production
  `az deployment sub validate` commands passed.
- The first full validation exposed stale executable-path metadata only during
  the hardened fresh-worktree bootstrap. Refreshed lock metadata without
  changing package versions, reviewed the 19 path normalizations, and reran the
  full validation successfully.
- Validation passed: pinned Bicep lint/build/parameter compilation and
  infrastructure policies; immutable install; formatting; lint; policy;
  fail-closed continuous integration simulation; security audit; 187 tests with
  coverage; generated-state check; type check; production build; bundle budget;
  Storybook build; and `git diff --check`.
- No Azure resource deployment, secret publication, frontend or application
  publication, asset upload, endpoint verification, or live telemetry
  collection was performed or claimed. US-009 remains incomplete.
