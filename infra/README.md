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
bot protection, and environment-aware rate limits. Later issue #1 stories
complete secure runtime references, observability, publication automation, and
live verification.

## Layout

| Path | Responsibility |
| --- | --- |
| `main.bicep` | Subscription orchestration, required tags, module composition, and non-secret outputs |
| `modules/resource-group.bicep` | Resource group lifecycle at subscription scope |
| `modules/foundation.bicep` | Resource-group-scoped deterministic service names and output contract |
| `modules/static-web-app.bicep` | Azure Static Web Apps Standard frontend and Vite artifact publication contract |
| `modules/container-registry.bicep` | Azure Container Registry Basic, pull-only managed identity, and scoped `AcrPull` assignment |
| `modules/container-app-api.bicep` | Azure Container Apps environment, API revision, ingress, scaling, settings, and runtime identity |
| `modules/authentication-readiness.bicep` | Keyless Microsoft Entra authentication contract and Static Web Apps linked API boundary |
| `modules/asset-storage.bicep` | Private Blob Storage containers, recovery policy, and OpenID Connect-federated asset publisher identity |
| `modules/asset-content-delivery.bicep` | Azure Front Door Premium profile, managed origin authentication, category routes, and explicit edge caching |
| `modules/public-ingress.bicep` | Canonical frontend route, WAF security policy, managed default and bot rules, per-path rate limits, and Static Web Apps forwarding-gateway contract |
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

The outputs contain only the selected subscription and region, resource group
identity, required tags, deterministic resource names, and the frontend, API,
registry, asset, content delivery, and identity deployment contracts. They must
never contain storage keys, registry credentials, deployment credentials,
provider secrets, connection strings, or resolved secret values.

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
4. The frontend and API retain separate system-assigned managed identities for
   future least-privilege service access. The registry pull identity remains a
   third, pull-only identity.

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
approved secret reference for any service-issued deployment credential and
keep the resolved value masked and process-local. Never place that value in
Bicep parameters, deployment outputs, repository files, logs, artifacts, or
pull request content. The deployment workflow and exact publisher invocation
are intentionally deferred to US-009.

## Containerized API and registry

`modules/container-registry.bicep` declares Azure Container Registry Basic with
administrative credentials and anonymous pull disabled. Its public network
endpoint remains enabled because private endpoints require the Premium tier.
Microsoft Entra role-based access control remains the authentication boundary:
a dedicated user-assigned managed identity receives only `AcrPull` on this
registry, and the Container App uses that identity only for image retrieval.
No registry password, access key, or connection string is accepted or emitted.

`modules/container-app-api.bicep` declares a consumption-only Azure Container
Apps environment and one Container App in single-revision mode. The app has a
separate system-assigned runtime identity with no data-plane role assignments
in this story. Later modules can grant that principal narrowly scoped access to
named resources without widening the image-pull identity.

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
environment variables are Bicep parameters. `apiSecretEnvironmentReferences`
accepts only Container Apps secret reference names; it never carries secret
values. The secure configuration story will create those named references
through managed identity and an approved secret store before any are used.

The initial image is the digest-pinned Microsoft Container Apps hello-world
image. It is a deterministic bootstrap revision only, not the Game Hub API and
not API functionality evidence. Future image automation publishes an immutable
image to the `apiImageRepository` output, then supplies that full image
reference as `apiContainerImage`. Push automation must use a separate
Microsoft Entra workload identity federated through OpenID Connect and a
least-privilege registry role; registry administrative credentials remain
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
| `apiRuntimePrincipalId` | Future least-privilege runtime role assignments |
| `apiDeployment` | Non-secret image, ingress, scaling, registry, identity, resource group, and subscription contract |

The direct Container App endpoint is diagnostic. Azure Front Door is the
canonical browser hostname, and the browser API path is fixed at `/api` through
the Static Web Apps linked backend. These outputs do not prove that the
registry, environment, app, image, or endpoint exists. They are available only
after an actual Azure deployment, which this repository change does not
perform.

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
media and static files use shorter category-specific durations. Purge only
changed mutable paths after publication; the exact publication and purge
workflow is deferred to US-009.

### Microsoft Entra upload targets

The storage module creates a publication-only user-assigned managed identity,
grants it `Storage Blob Data Contributor` on the dedicated asset account, and
adds a GitHub OpenID Connect federated credential with subject
`repo:jdylanmc/game-hub:environment:<environment>`. A later workflow must run in
the matching protected GitHub environment and use this identity; it must not
create a client secret.

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
