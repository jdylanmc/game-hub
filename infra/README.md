# Game Hub Azure Infrastructure

The `infra/` directory is the declarative deployment boundary for Game Hub.
`main.bicep` is a subscription-scope entry point that creates one resource
group per environment and composes bounded modules at their required scopes.
Reusing the same entry point and parameter file converges on the same resource
names; no timestamp, random name, imperative resource creation command, or
Azure portal step is part of the deployment path.

The current stack creates the environment resource group, an Azure Static Web
Apps Standard frontend, Azure Container Registry Basic, an Azure Container Apps
consumption environment and application boundary for the future application
programming interface (API), private Blob Storage asset containers, and Azure
Front Door Premium as the canonical frontend, API, authentication, and asset
ingress. The Front Door endpoint has a web application firewall (WAF), managed
bot protection, and environment-aware rate limits. Azure Key Vault,
least-privilege managed identities, Log Analytics, Application Insights, and
platform diagnostic settings complete the operational baseline. Protected
GitHub Actions workflows perform infrastructure, frontend, API image, and asset
publication without storing an Azure credential.

## Layout

| Path | Responsibility |
| --- | --- |
| `main.bicep` | Subscription orchestration, required tags, module composition, and non-secret outputs |
| `modules/resource-group.bicep` | Resource group lifecycle at subscription scope |
| `modules/foundation.bicep` | Resource-group-scoped deterministic service names and output contract |
| `modules/static-web-app.bicep` | Azure Static Web Apps Standard frontend and Vite artifact publication contract |
| `modules/container-registry.bicep` | Azure Container Registry Basic, pull-only managed identity, and scoped `AcrPull` assignment |
| `modules/container-app-api.bicep` | Azure Container Apps environment, API revision, ingress, scaling, settings, and runtime identity |
| `modules/secure-configuration.bicep` | Azure Key Vault, runtime and publication identities, OpenID Connect federation, and least-privilege vault roles |
| `modules/observability.bicep` | Log Analytics, workspace-based Application Insights, diagnostic settings, retention, sampling, and ingestion cap |
| `modules/authentication-readiness.bicep` | Keyless Microsoft Entra authentication contract and Static Web Apps linked API boundary |
| `modules/asset-storage.bicep` | Private Blob Storage containers, recovery policy, and OpenID Connect-federated asset publisher identity |
| `modules/asset-content-delivery.bicep` | Azure Front Door Premium profile, managed origin authentication, category routes, and explicit edge caching |
| `modules/public-ingress.bicep` | Canonical frontend route, WAF security policy, managed default and bot rules, per-path rate limits, and Static Web Apps forwarding-gateway contract |
| `modules/deployment-publishers.bicep` | Frontend and API publication identities, immutable GitHub federation, and scoped publication roles |
| `bootstrap/` | One-time Bicep bootstrap for the environment-scoped infrastructure deployment identity |
| `environments/dev.bicepparam` | On-demand development values |
| `environments/prod.bicepparam` | Persistent production-ready values |
| `.bicep-version` | Exact Bicep command-line interface (CLI) version used locally and by future automation |
| `bicepconfig.json` | Bicep linter rules, including secret-output and secure-parameter enforcement |

Both environments explicitly select Azure subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`, region `eastus2`, a stable `eus2`
region code, lifecycle tags, and distinct resource names. The committed
parameter files contain configuration only. Do not add credentials, tokens,
keys, connection strings, secret values, or personal contact data.

## Pinned tooling

Azure CLI installs the repository-pinned Bicep CLI without requiring Azure
credentials:

```bash
yarn infra:install
yarn infra:check
```

The pin is `v0.46.1`. Update `.bicep-version` through a reviewed change and run
both commands after the update. `yarn infra:check` refuses a different Bicep
version and validates every committed Bicep module and environment parameter
file without writing compiled templates to the repository.

## Authenticate without stored credentials

Local operators authenticate with Microsoft Entra ID through Azure CLI.
Automation must use Microsoft Entra workload identity federation and OpenID
Connect. Do not create or store a client secret for deployment. Authentication
grants access only; every command below still selects the subscription
explicitly.

## Bootstrap protected deployment identities

An Azure administrator performs one Bicep bootstrap per environment. The
bootstrap creates the workload resource group, a separate identity resource
group, one user-assigned deployment identity, and the immutable GitHub
environment federation. It grants only subscription deployment execution at
subscription scope and grants Contributor plus Role Based Access Control
Administrator only on that environment's workload resource group. It does not
grant a client credential or a data-plane role.

```bash
SUBSCRIPTION_ID='11213dbd-39fe-46ba-87db-5f5e8c449aed'
ENVIRONMENT='dev'
BOOTSTRAP_NAME="game-hub-deployment-identity-${ENVIRONMENT}"

az account set --subscription "$SUBSCRIPTION_ID"
test "$(az account show --query id --output tsv)" = "$SUBSCRIPTION_ID"

az deployment sub what-if \
  --subscription "$SUBSCRIPTION_ID" \
  --name "$BOOTSTRAP_NAME" \
  --location eastus2 \
  --template-file infra/bootstrap/main.bicep \
  --parameters "infra/bootstrap/${ENVIRONMENT}.bicepparam"

az deployment sub create \
  --subscription "$SUBSCRIPTION_ID" \
  --name "$BOOTSTRAP_NAME" \
  --location eastus2 \
  --template-file infra/bootstrap/main.bicep \
  --parameters "infra/bootstrap/${ENVIRONMENT}.bicepparam"
```

Configure protected GitHub environments named `dev` and `prod`, restrict
deployment branches to `main`, require the intended reviewers, and populate
only non-secret environment variables. Resolve the repository-owner token in
the current process; do not change the globally active GitHub CLI account.

```bash
DEPLOYMENT_OUTPUT="$(
  az deployment sub show \
    --subscription "$SUBSCRIPTION_ID" \
    --name "$BOOTSTRAP_NAME" \
    --query properties.outputs.deploymentIdentityConfiguration.value \
    --output json
)"
GH_TOKEN="$(GH_TOKEN= GITHUB_TOKEN= gh auth token --hostname github.com --user jdylanmc)"

GH_TOKEN="$GH_TOKEN" gh variable set AZURE_INFRA_CLIENT_ID \
  --repo jdylanmc/game-hub \
  --env "$ENVIRONMENT" \
  --body "$(jq -r .clientId <<< "$DEPLOYMENT_OUTPUT")"
GH_TOKEN="$GH_TOKEN" gh variable set AZURE_TENANT_ID \
  --repo jdylanmc/game-hub \
  --env "$ENVIRONMENT" \
  --body "$(jq -r .tenantId <<< "$DEPLOYMENT_OUTPUT")"
unset GH_TOKEN DEPLOYMENT_OUTPUT
```

After the first full stack deployment, set the following additional
environment variables from the non-secret deployment outputs:

| GitHub environment variable | Deployment output |
| --- | --- |
| `AZURE_FRONTEND_CLIENT_ID` | `deploymentPublisherIdentities.value.frontend.clientId` |
| `AZURE_API_CLIENT_ID` | `deploymentPublisherIdentities.value.api.clientId` |
| `AZURE_ASSET_CLIENT_ID` | `assetPublisherIdentityClientId.value` |
| `AZURE_SECRET_CLIENT_ID` | `secretPublisherIdentity.value.clientId` |

The infrastructure, frontend, API, asset, and secure-configuration identities
are separate. All federation subjects use
`repo:jdylanmc@6954990/game-hub@1330993568:environment:<environment>`.

## Preview and deploy

Choose one committed environment file and keep a stable subscription deployment
name and location. Changing values in the file updates the same resources;
deleting the development resource group is the documented cleanup boundary.

```bash
SUBSCRIPTION_ID='11213dbd-39fe-46ba-87db-5f5e8c449aed'
ENVIRONMENT='dev'
PARAMETERS_FILE="infra/environments/${ENVIRONMENT}.bicepparam"
DEPLOYMENT_NAME="game-hub-${ENVIRONMENT}"

az account set --subscription "$SUBSCRIPTION_ID"
test "$(az account show --query id --output tsv)" = "$SUBSCRIPTION_ID"

az deployment sub validate \
  --subscription "$SUBSCRIPTION_ID" \
  --name "$DEPLOYMENT_NAME" \
  --location eastus2 \
  --template-file infra/main.bicep \
  --parameters "$PARAMETERS_FILE"

az deployment sub what-if \
  --subscription "$SUBSCRIPTION_ID" \
  --name "$DEPLOYMENT_NAME" \
  --location eastus2 \
  --template-file infra/main.bicep \
  --parameters "$PARAMETERS_FILE"

az deployment sub create \
  --subscription "$SUBSCRIPTION_ID" \
  --name "$DEPLOYMENT_NAME" \
  --location eastus2 \
  --template-file infra/main.bicep \
  --parameters "$PARAMETERS_FILE"
```

Run `what-if` before every deployment. Re-run `what-if` with the same commit
and parameters after deployment to verify convergence. The commands use the
same fixed subscription deployment name and location because Azure keeps a
deployment name's location immutable.

`.github/workflows/deploy-hosting-infrastructure.yml` performs the same
validate, `what-if`, create, output capture, and repeat-`what-if` sequence from
protected `main`. It authenticates through `AZURE_INFRA_CLIENT_ID`, uses the
repository-pinned Bicep CLI, and fails if the repeated preview contains a
create, modify, or delete operation.

The outputs contain only the selected subscription and region, resource group
identity, required tags, deterministic resource names, and the frontend, API,
registry, asset, content delivery, managed identity, secure-reference,
monitoring, and cost-control contracts. They must never contain storage keys,
registry credentials, deployment credentials, provider secrets, connection
strings, or resolved secret values.

## Frontend hosting

`modules/static-web-app.bicep` declares Azure Static Web Apps Standard without a
repository token or generated workflow. The deterministic resource name comes
from the foundation module. Both environments accept application configuration
updates from the committed `staticwebapp.config.json`; development enables
preview staging environments, while production disables them until a reviewed
release process needs them. Azure Front Door is the canonical protected public
endpoint. The generated Static Web Apps hostname remains a diagnostic origin,
not a browser contract.

The subscription deployment returns these non-secret frontend outputs:

| Output | Use |
| --- | --- |
| `frontendResourceId` | Role assignments and later service links |
| `frontendResourceName` | Content publication target |
| `frontendDefaultHostname` | Generated hostname without a scheme |
| `frontendEndpoint` | Direct HTTPS diagnostic endpoint |
| `publicEndpoint` | Canonical Azure Front Door endpoint protected by the WAF |
| `frontendDeployment` | Subscription, resource group, app name, build command, artifact path, canonical endpoint, forwarding-gateway configuration, and production environment |

These outputs do not prove that the resource or content exists. They are
available only after an actual Azure deployment, which this repository change
does not perform.

## Authentication and API trust boundary

The frontend uses the Azure-managed Microsoft Entra ID provider built into
Azure Static Web Apps. Its OpenID Connect flow is available at
`/.auth/login/aad`, the friendly `/login` route redirects there, `/logout`
redirects to the platform sign-out endpoint, and the unused preconfigured
GitHub provider is blocked. This selection is keyless: the repository,
parameter files, and deployment outputs contain no provider registration
credential.

`public/staticwebapp.config.json` requires the built-in `authenticated` role
for `/api/*`. The authentication module declaratively links the existing Azure
Container App as the Static Web Apps production backend. Azure then configures
the `Azure Static Web Apps (Linked)` provider on the Container App, so the API
accepts requests proxied by the static web app rather than treating its direct
diagnostic hostname as a browser origin.

The resulting trust boundaries are stable:

1. Azure Static Web Apps terminates the browser's Microsoft Entra OpenID
   Connect flow and owns `/.auth/*`.
2. Browser API calls use the same-origin `/api` path and must have the
   `authenticated` role.
3. The linked backend is the only trusted browser-to-API path. API code reads
   the platform-generated `x-ms-client-principal` context and never trusts a
   client-supplied copy received outside that boundary.
4. The frontend retains a system-assigned identity. The API attaches a
   dedicated user-assigned runtime identity for Key Vault access, a separate
   pull-only identity for Azure Container Registry, and its platform
   system-assigned identity; those identities are not interchangeable.

The preconfigured Microsoft Entra provider permits Microsoft accounts accepted
by the managed provider. Tenant-, group-, and operation-level authorization
remain explicit application policy; they must not be simulated by accepting a
provider credential in Bicep. If a future requirement mandates a tenant-scoped
custom registration, it needs a separate reviewed design because Static Web
Apps custom registrations require a credential. That refinement does not
replace the Static Web App, linked Container App, Blob Storage, or Azure Front
Door boundaries.

The deployment returns only non-secret authentication metadata:

| Output | Use |
| --- | --- |
| `frontendManagedIdentityPrincipalId` | Future least-privilege role assignments for the frontend |
| `apiLinkedBackendId` | Audit the production Static Web Apps-to-Container Apps link |
| `authenticatedApiEndpoint` | Same-origin API endpoint under the canonical protected Front Door hostname |
| `authenticationConfiguration` | Provider, protocol, login/logout/current-user paths, role, principal-header, managed-identity, and trust-boundary contract |

The development and production parameter files also supply the API with the
non-secret `GAME_HUB_AUTH_PROVIDER`, `GAME_HUB_AUTH_PRINCIPAL_HEADER`, and
`GAME_HUB_AUTH_REQUIRED_ROLE` placeholders. Their values are validated against
the deployment output contract.

These contracts do not prove that a user signed in or that the linked endpoint
is reachable. This story performs no live infrastructure deployment or
authentication-flow test.

### Vite artifact contract

The frontend publisher consumes the repository's existing production build:

```bash
yarn build
test -f dist/index.html
test -f dist/staticwebapp.config.json
```

Vite writes the application to `dist/` and copies
`public/staticwebapp.config.json` to `dist/staticwebapp.config.json`. Publish
that complete directory to the `production` environment of the static web app
identified by `frontendDeployment`; do not rebuild it with a service-specific
build command.

Infrastructure automation authenticates to Azure with Microsoft Entra ID and
OpenID Connect, then explicitly selects subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`. Content publication must use an
approved service-issued deployment credential and keep the resolved value
masked and process-local. `.github/workflows/deploy-frontend.yml` first signs
in with `AZURE_FRONTEND_CLIENT_ID`, merges the live non-secret Front Door
hostname and ID into the built `staticwebapp.config.json`, then resolves the
Static Web Apps deployment token at runtime and masks it before invoking the
pinned publisher. Azure authentication is keyless; the service-issued token is
never stored in GitHub, Bicep, repository files, logs, or retained artifacts.

## Containerized API and registry

`modules/container-registry.bicep` declares Azure Container Registry Basic with
administrative credentials and anonymous pull disabled. Its public network
endpoint remains enabled because private endpoints require the Premium tier.
Microsoft Entra role-based access control remains the authentication boundary:
a dedicated user-assigned managed identity receives only `AcrPull` on this
registry, and the Container App uses that identity only for image retrieval.
No registry password, access key, or connection string is accepted or emitted.

`modules/container-app-api.bicep` declares a consumption-only Azure Container
Apps environment and one Container App in single-revision mode. The environment
uses the Azure Monitor log destination, so diagnostic settings route platform
logs without retrieving or supplying a Log Analytics workspace key. The app
keeps its platform system-assigned identity, attaches the pull-only registry
identity, and attaches a separate user-assigned runtime identity whose only
data-plane grant is Key Vault Secrets User on this environment's vault.

The committed environment files make the following API settings explicit:

| Setting | Development | Production |
| --- | --- | --- |
| Minimum replicas | `0` | `1` |
| Maximum replicas | `2` | `5` |
| CPU | `0.25` vCPU | `0.5` vCPU |
| Memory | `0.5Gi` | `1Gi` |
| HTTP concurrency target | `50` | `100` |
| Ingress | External HTTPS, port `80`, automatic HTTP transport | External HTTPS, port `80`, automatic HTTP transport |

Image reference, private repository name, ingress exposure, target port,
transport, replica limits, allocation, HTTP concurrency, and non-secret
environment variables are Bicep parameters. `apiKeyVaultSecretReferences`
accepts only a Container Apps secret alias and a versionless Key Vault secret
URI. `apiSecretEnvironmentReferences` maps an application environment variable
to one of those aliases. Neither parameter accepts or resolves a secret value.

The initial image is the digest-pinned Microsoft Container Apps hello-world
image. It is a deterministic bootstrap revision only, not the Game Hub API and
not API functionality evidence. `.github/workflows/deploy-api-image.yml`
requires `api/Dockerfile`, builds the reviewed `main` commit, signs in through
the dedicated API publisher identity, pushes a commit-tagged image with
`AcrPush`, resolves its registry digest, and updates the Container App to the
immutable digest. The identity has only resource-group read, registry push, and
Container App contributor access; registry administrative credentials remain
disabled.

The subscription deployment returns these non-secret API and registry outputs:

| Output | Use |
| --- | --- |
| `registryResourceId`, `registryName`, `registryLoginServer` | Registry deployment and role-assignment targets |
| `apiImageRepository` | Stable private repository target for immutable API images |
| `apiImagePullIdentityId`, client ID, principal ID, and role assignment ID | Audit the pull-only identity boundary |
| `apiEnvironmentResourceId`, `apiEnvironmentName` | Container Apps environment operations |
| `apiResourceId`, `apiResourceName` | Container App deployment target |
| `apiDefaultHostname`, `apiEndpoint` | Stable revision-independent direct diagnostic endpoint |
| `apiRuntimeIdentity` | Audit the dedicated runtime identity, platform identity, and Key Vault Secrets User assignment |
| `apiDeployment` | Non-secret image, ingress, scaling, registry, identity, resource group, and subscription contract |

The direct Container App endpoint is diagnostic. Azure Front Door is the
canonical browser hostname, and the browser API path is fixed at `/api` through
the Static Web Apps linked backend. These outputs do not prove that the
registry, environment, app, image, or endpoint exists. They are available only
after an actual Azure deployment, which this repository change does not
perform.

## Secure runtime configuration

`modules/secure-configuration.bicep` creates one Standard Key Vault per
environment with Azure role-based access control, soft delete, and no access
policies. Development retains deleted objects for seven days and permits normal
resource-group cleanup. Production retains them for 90 days and enables
irreversible purge protection.

The API runtime identity receives only Key Vault Secrets User on that dedicated
vault. A separate publication-only identity receives Key Vault Secrets Officer
and trusts only the matching protected GitHub environment through the immutable
subject `repo:jdylanmc@6954990/game-hub@1330993568:environment:<environment>`.
The same immutable subject format is used by the asset publisher. No client
credential is created.

An approved secret broker supplies each resolved value directly to Key Vault
while authenticated through `AZURE_SECRET_CLIENT_ID`. Infrastructure
deployment receives only a secret alias and versionless vault URI in
`apiKeyVaultSecretReferences`, then maps the alias to the named container
environment variable through `apiSecretEnvironmentReferences`. Container Apps
resolves the value through the API runtime identity and injects it only at
runtime. Do not put a resolved value in a parameter file, command argument,
output, log, artifact, issue, pull request, or deployment workflow input.

The secure outputs are intentionally non-secret:

| Output | Use |
| --- | --- |
| `apiRuntimeIdentity` | Runtime identity resource, client and principal identifiers plus its vault role assignment |
| `secretPublisherIdentity` | Publication identity identifiers, federated credential, and vault role assignment |
| `secureConfiguration` | Vault resource identity, URI, recovery policy, and unresolved reference mapping |

The committed development and production files use empty reference arrays
until an application requirement names a specific runtime setting. No secret
resource or secret value is declared by this baseline.

## Observability and cost guardrails

`modules/observability.bicep` creates one PerGB2018 Log Analytics workspace and
one workspace-based Application Insights resource per environment. Platform
diagnostic settings send Static Web Apps logs and metrics, Container Registry
logs and metrics, Container Apps environment system and console logs, Container
App metrics, Blob service logs and metrics, Front Door access/health/WAF logs
and metrics, and Key Vault audit logs and metrics to that workspace.

Both environments retain analytics data for 30 days. Development caps workspace
ingestion at 1 GB per day and keeps Application Insights sampling at 100% for
short-lived debugging. Production caps ingestion at 5 GB per day and starts at
25% sampling. These are budget-conscious safety limits, not service-level
objectives; a reached ingestion cap can create an observability gap and requires
an operational review before being raised.

Cost controls remain environment aware:

| Control | Development | Production |
| --- | --- | --- |
| API replicas | Scale to zero, maximum 2 | Minimum 1, maximum 5 |
| API allocation | 0.25 vCPU, 0.5 GiB | 0.5 vCPU, 1 GiB |
| Blob recovery | 7 days, locally redundant | 14 days, zone redundant |
| Key Vault recovery | 7 days, purge protection off | 90 days, purge protection on |
| Monitoring | 30 days, 1 GB/day, 100% sampling | 30 days, 5 GB/day, 25% sampling |
| Lifecycle tag | On demand | Persistent |
| Cost profile tag | Constrained | Production baseline |

Every resource that supports tags receives application, environment, owner,
cost center, repository, lifecycle, data classification, and cost-profile
metadata. `monitoringConfiguration` exposes monitoring resource identifiers,
diagnostic setting identifiers, retention, sampling, and ingestion limits.
`costControlConfiguration` exposes the effective replica, recovery, monitoring,
and tag guardrails. Neither output contains telemetry credentials or application
data.

## Blob assets and content delivery

`modules/asset-storage.bicep` declares one dedicated general-purpose v2 storage
account with three private containers:

| Category | Container | Intended content |
| --- | --- | --- |
| Game assets | `game-assets` | Independently packaged game resources that use immutable, content-hashed names |
| User-facing media | `media` | Mutable images and media whose cache must refresh comparatively quickly |
| Other static assets | `static-assets` | Non-application static files that do not belong in Vite's `/assets/` bundle path |

The account disables anonymous blob access, Shared Key authorization, local
users, Secure File Transfer Protocol (SFTP), Network File System version 3
(NFSv3), and cross-tenant replication. Microsoft Entra ID is the default
authorization mode. HTTPS, Transport Layer Security (TLS) 1.2, infrastructure
encryption, private container access, and environment-specific soft-delete
retention are explicit. Development uses locally redundant storage and seven
days of recovery; production uses zone-redundant storage and fourteen days.
Versioning and automatic tier transitions remain disabled until measured
recovery and access patterns justify their additional storage and retrieval
cost.

Azure Front Door origin authentication currently cannot be combined with an
Azure Front Door Private Link origin. The storage public endpoint therefore
remains network reachable, but anonymous and Shared Key requests cannot read
the containers. The Front Door profile uses a system-assigned managed identity
with only `Storage Blob Data Reader` on this dedicated asset account, requests
the `https://storage.azure.com/.default` audience, and forwards only HTTPS to
the blob origin. No storage access key or Shared Access Signature (SAS) is
created, accepted, or emitted.

`modules/asset-content-delivery.bicep` creates three independent routes on the
same Front Door Premium endpoint. Query strings do not fragment the cache, and
compressible text, font, JavaScript, WebAssembly, and structured-data content
types use edge compression.

| Route | Development cache | Production cache |
| --- | ---: | ---: |
| `/game-assets/*` | 1 day | 365 days |
| `/media/*` | 5 minutes | 1 hour |
| `/static-assets/*` | 1 hour | 1 day |

Game asset publishers must use content-hashed object names because the
production route intentionally treats them as immutable for one year. Mutable
media and static files use shorter category-specific durations.
`.github/workflows/deploy-assets.yml` accepts repository-relative source
directories, uploads with `--auth-mode login`, and purges only the mutable
category paths that were supplied. Immutable game assets are not purged.

### Microsoft Entra upload targets

The storage module creates a publication-only user-assigned managed identity,
grants it `Storage Blob Data Contributor` on the dedicated asset account, and
adds a GitHub OpenID Connect federated credential with subject
`repo:jdylanmc@6954990/game-hub@1330993568:environment:<environment>`. The
asset deployment workflow runs in that matching protected environment and does
not create a client credential.

After an actual infrastructure deployment and Microsoft Entra login, the
non-secret `assetUploadTargets` output supplies the account and container
names. Upload commands always select subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed` and use login authorization:

```bash
SUBSCRIPTION_ID='11213dbd-39fe-46ba-87db-5f5e8c449aed'
ENVIRONMENT='dev'
DEPLOYMENT_NAME="game-hub-${ENVIRONMENT}"

az account set --subscription "$SUBSCRIPTION_ID"
test "$(az account show --query id --output tsv)" = "$SUBSCRIPTION_ID"

STORAGE_ACCOUNT="$(
  az deployment sub show \
    --subscription "$SUBSCRIPTION_ID" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.assetStorageAccountName.value \
    --output tsv
)"

az storage blob upload-batch \
  --subscription "$SUBSCRIPTION_ID" \
  --auth-mode login \
  --account-name "$STORAGE_ACCOUNT" \
  --destination game-assets \
  --source "$GAME_ASSETS_DIRECTORY" \
  --overwrite

az storage blob upload-batch \
  --subscription "$SUBSCRIPTION_ID" \
  --auth-mode login \
  --account-name "$STORAGE_ACCOUNT" \
  --destination media \
  --source "$MEDIA_DIRECTORY" \
  --overwrite

az storage blob upload-batch \
  --subscription "$SUBSCRIPTION_ID" \
  --auth-mode login \
  --account-name "$STORAGE_ACCOUNT" \
  --destination static-assets \
  --source "$STATIC_ASSETS_DIRECTORY" \
  --overwrite
```

The deployment also returns `assetContentEndpoints` for the public category
URLs and `assetCaching` for the effective edge policy. These contracts do not
prove that Azure resources exist, that any asset was uploaded, or that any
endpoint is reachable. This story performs and claims no live deployment,
upload, purge, or endpoint verification.

## Protected public ingress

`modules/public-ingress.bicep` extends the existing Azure Front Door Premium
profile and endpoint instead of creating a second edge. It adds the Azure
Static Web Apps origin and catch-all route, creates one WAF policy, and
associates that policy with `/*` on the endpoint. More-specific asset routes
continue to use the managed-identity Blob Storage origin; the catch-all route
forwards frontend, authentication, and API traffic to Static Web Apps over
HTTPS without Front Door caching.

The security policy protects the canonical paths below:

| Public path | Origin path | WAF coverage | Rate-limit layers |
| --- | --- | --- | --- |
| `/*` | Azure Static Web Apps frontend | Managed default rules `2.1`, managed bot rules `1.1` | General |
| `/.auth/*`, `/login`, `/logout` | Static Web Apps authentication | Same all-path managed rules | Authentication and general |
| `/api`, `/api/*` | Static Web Apps linked Container App | Same all-path managed rules | API and general |
| `/game-assets/*`, `/media/*`, `/static-assets/*` | Private Blob Storage containers | Same all-path managed rules | General |

All rate limits use Azure Front Door WAF custom `RateLimitRule` rules, a fixed
five-minute window, and the client socket IP address:

| Setting | Development | Production |
| --- | ---: | ---: |
| WAF mode | `Detection` | `Prevention` |
| API requests per five minutes | `2000` | `1000` |
| Authentication requests per five minutes | `1000` | `500` |
| General requests per five minutes | `10000` | `5000` |

Development detection mode records rule matches but intentionally does not
block them while the policy is tuned. Production prevention mode enforces
managed-rule and rate-limit actions. The committed values are bounded starting
points, not measured capacity or a denial-of-service guarantee. Front Door
counters are distributed, low thresholds can admit some excess traffic, and a
shared proxy or carrier network can put legitimate users behind one socket IP.
Review WAF logs before changing thresholds or adding narrowly scoped managed
rule exclusions.

Azure Front Door Premium remains the dominant fixed edge cost. This story
reuses the profile already required for managed bot rules and Microsoft
Entra-authenticated Blob Storage delivery rather than adding another edge.
Processed requests, data transfer, WAF evaluation, and diagnostic ingestion
remain variable costs. Development should keep the full profile on demand;
production keeps an isolated persistent profile. Use the Azure pricing
calculator and measured WAF log volume before production approval.

Direct service hostnames are not equivalent to the canonical WAF boundary.
Blob Storage rejects anonymous and Shared Key reads, and the Container App uses
the linked-backend identity provider. Static Web Apps forwarding restrictions
must be published with the frontend artifact after infrastructure deployment.
The non-secret `frontendDeployment.forwardingGatewayConfiguration` output
supplies the generated Front Door hostname, `X-Azure-FDID` value, and
`AzureFrontDoor.Backend` service-tag restriction that publication automation
must merge into `staticwebapp.config.json`. Until that artifact is published,
the generated Static Web Apps hostname remains diagnostic and can bypass the
WAF; it must not be treated as production-ready.

The subscription deployment exposes `publicEndpoint`,
`publicIngressConfiguration`, `webApplicationFirewallPolicyId`,
`frontDoorSecurityPolicyId`, and `frontDoorId` without emitting credentials.
`scripts/check-public-ingress-infrastructure.mjs` fails closed if the protected
path mapping, Premium profile, managed rules, environment modes, rate limits,
forwarding-gateway contract, or canonical authentication hostname regresses.
No Azure resource deployment, WAF enforcement, bot classification, rate-limit
event, origin restriction, or endpoint reachability was performed or verified
by US-007.

## Deployment workflow order

Run deployments only from protected `main` and select the matching protected
GitHub environment:

1. **Deploy Game Hub infrastructure** — validates, previews, applies, captures
   outputs, and proves a repeated preview converges.
2. **Publish approved runtime configuration** — an external secret broker
   writes values to Key Vault through `AZURE_SECRET_CLIENT_ID`; commit and
   deploy only aliases and versionless Key Vault URIs.
3. **Deploy Game Hub API image** — after `api/Dockerfile` exists, publishes the
   exact `main` commit to Azure Container Registry and updates Container Apps
   by digest.
4. **Deploy Game Hub frontend** — builds `dist/`, injects the non-secret Front
   Door forwarding restriction, resolves the Static Web Apps publication token
   only in runner memory, and publishes.
5. **Deploy Game Hub assets** — uploads one or more reviewed directories with
   Microsoft Entra authorization and purges changed mutable paths.

Production environment approval is the release gate. Do not run production
application publication against infrastructure from another commit; compare
the infrastructure workflow artifact and application workflow SHA first.

## End-to-end verification procedure

The commands below are a procedure, not evidence that this pull request
deployed Azure. Record the Azure deployment name, GitHub workflow run URLs,
exact commit SHA, UTC timestamps, command output, and any browser screenshots
in the release record outside the repository. Never record a resolved secret,
deployment token, storage authorization value, or authentication cookie.

### 1. Select the subscription and inspect outputs

```bash
SUBSCRIPTION_ID='11213dbd-39fe-46ba-87db-5f5e8c449aed'
ENVIRONMENT='dev'
DEPLOYMENT_NAME="game-hub-${ENVIRONMENT}"

az account set --subscription "$SUBSCRIPTION_ID"
test "$(az account show --query id --output tsv)" = "$SUBSCRIPTION_ID"

az deployment sub show \
  --subscription "$SUBSCRIPTION_ID" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs.{
    subscriptionId:subscriptionId.value,
    resourceGroup:resourceGroupName.value,
    publicEndpoint:publicEndpoint.value,
    authenticatedApiEndpoint:authenticatedApiEndpoint.value,
    frontend:frontendResourceName.value,
    api:apiResourceName.value,
    registry:registryName.value,
    storage:assetStorageAccountName.value,
    content:assetContentEndpoints.value,
    auth:authenticationConfiguration.value,
    ingress:publicIngressConfiguration.value,
    publishers:deploymentPublisherIdentities.value,
    secureConfiguration:secureConfiguration.value
  }' \
  --output jsonc
```

Confirm every output is present, the subscription matches exactly, endpoint
outputs use HTTPS, environment names match, and no output contains a resolved
value, key, connection string, registry credential, or deployment token.

### 2. Verify frontend reachability and origin protection

```bash
PUBLIC_ENDPOINT="$(
  az deployment sub show \
    --subscription "$SUBSCRIPTION_ID" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.publicEndpoint.value \
    --output tsv
)"
DIRECT_FRONTEND_ENDPOINT="$(
  az deployment sub show \
    --subscription "$SUBSCRIPTION_ID" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.frontendEndpoint.value \
    --output tsv
)"

curl --fail --silent --show-error "$PUBLIC_ENDPOINT/" --output /dev/null
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "$DIRECT_FRONTEND_ENDPOINT/")" = '403'
```

The canonical endpoint must return the deployed frontend. The generated Static
Web Apps origin must reject a direct request after the publisher has applied
the forwarding-gateway configuration.

### 3. Verify frontend-to-API and authentication readiness

Before the Game Hub API replaces the bootstrap image, this step must be marked
not applicable; the bootstrap image is not API evidence. After the API exposes
a non-sensitive `/health` route:

1. Request `$PUBLIC_ENDPOINT/api/health` without a session and confirm the
   authenticated route does not return a successful API response.
2. Open `$PUBLIC_ENDPOINT/login`, complete Microsoft Entra ID sign-in, and
   confirm `$PUBLIC_ENDPOINT/.auth/me` returns the expected authenticated
   principal.
3. From the same browser session, request
   `$PUBLIC_ENDPOINT/api/health`; confirm the frontend receives the API health
   response through the same origin.
4. Confirm the API logs show the request through the Static Web Apps linked
   backend and that authorization used the platform-generated
   `x-ms-client-principal` context.
5. Open `$PUBLIC_ENDPOINT/logout`, then confirm `/api/health` is protected
   again.

Do not claim authentication acceptance from the presence of Bicep outputs
alone.

### 4. Verify asset upload and Azure Front Door delivery

Use the asset publisher identity or the protected asset workflow. This example
uploads a non-sensitive committed file and deletes the verification object
after the check:

```bash
STORAGE_ACCOUNT="$(
  az deployment sub show \
    --subscription "$SUBSCRIPTION_ID" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.assetStorageAccountName.value \
    --output tsv
)"
VERIFY_OBJECT="verification/$(git rev-parse HEAD)/games.manifest.json"

az storage blob upload \
  --subscription "$SUBSCRIPTION_ID" \
  --auth-mode login \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name static-assets \
  --name "$VERIFY_OBJECT" \
  --file public/generated/games.manifest.json \
  --overwrite true \
  --output none

curl --fail --silent --show-error \
  "$PUBLIC_ENDPOINT/static-assets/$VERIFY_OBJECT" \
  --output verification-download.json
cmp public/generated/games.manifest.json verification-download.json
rm verification-download.json

az storage blob delete \
  --subscription "$SUBSCRIPTION_ID" \
  --auth-mode login \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name static-assets \
  --name "$VERIFY_OBJECT" \
  --output none
```

Inspect response headers twice and record the Azure Front Door reference and
cache status. Do not require an immediate cache hit; propagation and cache
state are service runtime behavior. Also confirm an anonymous direct Blob
Storage request cannot read the private object.

### 5. Verify the ingress policy

```bash
RESOURCE_GROUP="rg-gamehub-${ENVIRONMENT}-eus2"
FRONT_DOOR_PROFILE="afd-gamehub-${ENVIRONMENT}-eus2"
WAF_POLICY="waf-gamehub-${ENVIRONMENT}-eus2"

az network front-door waf-policy show \
  --subscription "$SUBSCRIPTION_ID" \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WAF_POLICY" \
  --query '{enabled:policySettings.enabledState,mode:policySettings.mode,managedRules:managedRules.managedRuleSets[].ruleSetType,customRules:customRules.rules[].name}' \
  --output jsonc
```

Confirm the default and bot managed rule sets, the API/authentication/general
rate-limit rules, the all-path security-policy association, and the expected
environment mode. Send at most one approved web application firewall (WAF)
probe request and correlate it with the WAF diagnostic log. Development
detection mode should log the match; production prevention mode should block
the approved probe. Do not load-test rate limits as part of release
verification.

### 6. Verify secure runtime injection without reading values

Confirm Key Vault contains the approved secret names and enabled versions, then
inspect the Container App configuration only for each alias, versionless
`keyVaultUrl`, runtime identity resource ID, and environment-variable
`secretRef`. Do not run a command that returns a resolved value. Restart or
deploy the API revision, exercise the feature that consumes the setting, and
confirm success through application behavior and redacted diagnostics.

### 7. Repeat the deployment

Re-run the infrastructure workflow for the same environment and exact commit.
Its final `repeat-deployment-what-if.json` must contain no `Create`, `Modify`,
or `Delete` change. Then rerun the frontend, API image, and asset workflows
with the same immutable inputs. Confirm the canonical endpoint, authenticated
API path, and asset URLs remain stable and no duplicate resource was created.

Repository validation proves only that templates compile and that these
contracts remain present. Live acceptance requires the protected deployment
workflows and this procedure against the selected Azure environment.
---

# Adversarial review infrastructure

This directory defines the Azure resources for the unit-test reviewer. The
production resources were first deployed through the US-009 rollout; Bicep
remains the authority for repeat deployments.

## Deployed resources

- Subscription-scoped Bicep creates the environment resource group and a real
  Azure Consumption budget.
- The resource-group module creates Azure OpenAI with local authentication
  disabled and deploys `gpt-4.1-mini`, version `2025-04-14`, using the
  `GlobalStandard` consumption SKU in East US.
- Bicep grants the protected reviewer identity only **Cognitive Services OpenAI
  User** on the account. Inference uses Microsoft Entra ID tokens, never API
  keys or `listKeys`.
- Production budget is **$99/month**, with actual 80%, forecast 100%, and
  actual 100% email alerts to the recipients committed in `prod.bicepparam`.
  Budgets alert; they do not stop spend.
- `agents-config.json` fixes production runtime concurrency at three. The
  reviewer engine introduced by US-004 must consume this checked configuration;
  no current output is represented as a concurrency control.

The subscription registry was queried for subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`. East US reports the exact OpenAI model
`gpt-4.1-mini` version `2025-04-14` and the `GlobalStandard` SKU. Registry
attribution in `agents-config.json` matches that tuple exactly.

## Authentication and protected deployment

`.github/workflows/deploy-adversarial-infrastructure.yml` is manual-only. It
rejects every ref except `refs/heads/main` and targets the selected protected
GitHub environment (`test` or `prod`). Configure each environment with:

- required reviewers;
- deployment branch restricted to `main`;
- environment variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and
  `AZURE_REVIEWER_PRINCIPAL_ID`.

The workflow uses OpenID Connect (OIDC). These identifiers are configuration,
not credentials. Do not create branch or pull-request federated credentials.
GitHub emits immutable repository subjects for this repository. Use only:

```text
repo:jdylanmc@6954990/game-hub@1330993568:environment:adversarial-review
repo:jdylanmc@6954990/game-hub@1330993568:environment:test
repo:jdylanmc@6954990/game-hub@1330993568:environment:prod
```

`bicep/bootstrap-deployment-role.bicep` declaratively defines the narrow
deployment custom role; do not grant Contributor. Separate `test` and `prod`
deployment identities use only their matching protected-environment OpenID
Connect subjects. The main template declaratively grants the distinct reviewer
identity the built-in Cognitive Services OpenAI User role; it needs no
deployment or secret-management role.

`bicep/federated-identity.bicep` declaratively owns the three existing
application federated credentials through the Microsoft Graph Bicep extension.
The environment parameter files bind exact application `uniqueName`, credential
name, immutable owner/repository IDs, and protected environment. Run
`deploy-federated-identity.sh` as an administrator; the normal deployment
identities intentionally lack Microsoft Graph application-write permission.

## Validation

Build every parameter file without deploying:

```bash
for parameter_file in infra/*.bicepparam; do
  az bicep build-params --file "$parameter_file" --stdout > /dev/null
done
az bicep build --file infra/bicep/bootstrap-deployment-role.bicep --stdout > /dev/null
az bicep build --file infra/bicep/federated-identity.bicep --stdout > /dev/null
```

After protected identities exist, preview or deploy locally:

```bash
AZURE_REVIEWER_PRINCIPAL_ID=<object-id> ./infra/deploy.sh test
```

The script always performs a subscription-scoped what-if before deployment and
never configures GitHub secrets.

The `GlobalStandard` deployment provisions 500 capacity units (500,000 tokens
per minute) so one bounded worst-case review can fit without weakening the
two-megabyte context limit. Runtime concurrency remains capped at three and
each request still fails before inference above the configured `$0.25` cost
ceiling; throughput capacity is not treated as a cost control.

## Official references

- [Azure OpenAI models and versions](https://learn.microsoft.com/azure/ai-foundry/openai/concepts/models)
- [Keyless Azure OpenAI authentication](https://learn.microsoft.com/azure/developer/ai/keyless-connections)
- [Azure Consumption budgets Bicep reference](https://learn.microsoft.com/azure/templates/microsoft.consumption/budgets)
- [Create resource groups with Bicep](https://learn.microsoft.com/azure/azure-resource-manager/bicep/create-resource-group)
- [GitHub OpenID Connect with Azure](https://learn.microsoft.com/azure/developer/github/connect-from-azure)
