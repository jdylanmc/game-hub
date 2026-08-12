# Azure Hosting Infrastructure

This document resolves the baseline Azure topology for Game Hub. It is the
design input for the Bicep implementation tracked by GitHub issue #1.

The implementation entry point, environment parameters, pinned tooling, and
preview, publication, and end-to-end verification commands are documented in
[Game Hub Azure Infrastructure](../infra/README.md).

> **Evidence boundary:** The architecture and Bicep declarations are not
> deployment evidence. No Azure resources, frontend, container image, asset,
> authentication flow, web application firewall rule, or public endpoint was
> deployed or verified by this repository change. Live acceptance requires a
> protected workflow run and the recorded verification procedure.

## Deployment and publication automation

The implementation includes protected, main-only GitHub Actions workflows for
the complete deployment boundary:

- `deploy-hosting-infrastructure.yml` selects subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`, validates and previews Bicep, deploys
  with a stable name, captures non-secret outputs, and fails if the repeated
  preview does not converge.
- `deploy-frontend.yml` builds the reviewed Vite artifact, merges the live
  Azure Front Door forwarding restriction, retrieves the Static Web Apps
  service token only after keyless Microsoft Entra ID sign-in, masks it, and
  publishes the prebuilt output.
- `deploy-api-image.yml` uses a dedicated OpenID Connect identity with
  `AcrPush`, builds the `api` workspace through `api/Dockerfile`, publishes a
  commit-tagged image, resolves its digest, and updates Azure Container Apps by
  immutable digest.
- `deploy-assets.yml` accepts reviewed repository directories, uploads with
  Microsoft Entra authorization, and purges only changed mutable content
  categories.

The Bicep bootstrap creates one environment-specific infrastructure deployment
identity. The main stack creates separate frontend, API, asset, and secure
configuration publisher identities. Every federated credential is restricted
to the immutable repository and matching protected GitHub environment subject.
No client credential, registry password, storage key, Shared Access Signature
(SAS), connection string, or resolved application value is committed.

Secure application settings enter Azure Key Vault through the dedicated
publication identity and an approved external secret broker. Bicep contains
only aliases and versionless Key Vault URIs. Azure Container Apps resolves
those references with the runtime identity and injects values into named
environment variables without exposing them to build or deployment outputs.

The [end-to-end verification procedure](../infra/README.md#end-to-end-verification-procedure)
covers output reconciliation, canonical frontend reachability, direct-origin
rejection, same-origin authenticated API access, Microsoft Entra sign-in and
sign-out readiness, asset delivery, Azure Front Door cache observations, web
application firewall policy and diagnostic correlation, secure runtime
configuration, and repeat-deployment convergence. Repository checks validate
the declared contracts only and never substitute for live Azure evidence.

## Deployment Scope

Every deployment must explicitly select Azure subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`. The baseline uses:

- one resource group per environment;
- `eastus2` as the initial regional location;
- Azure Front Door and its web application firewall (WAF) in their required
  global location;
- separate `dev` and `prod` resource instances rather than shared mutable
  application resources; and
- subscription-scope Bicep as the only supported resource creation path.

`eastus2` is the initial single-region default because it supports the selected
regional services. It remains a parameter, not an application assumption.
Multi-region application origins are a future availability enhancement, not
part of the baseline.

The full development topology is intended to be deployed on demand rather than
kept running continuously. Production resources are persistent. This preserves
topology parity without making the comparatively expensive public edge a
permanent development cost.

## Selected Topology

```mermaid
flowchart LR
  user[Browser] --> afd[Azure Front Door Premium<br/>WAF, bot rules, rate limits]

  afd -->|Default route| swa[Azure Static Web Apps Standard<br/>React and Vite dist]
  afd -->|Managed identity<br/>/game-assets/*<br/>/media/*<br/>/static-assets/*| blob[Azure Blob Storage<br/>Private containers]

  swa -->|/api/* linked backend| api[Azure Container Apps<br/>Containerized API]
  swa -->|/.auth/*| auth[Static Web Apps authentication<br/>Microsoft Entra ID or GitHub]

  api -->|Managed identity image pull| acr[Azure Container Registry Basic]
  api -->|Managed identity| kv[Azure Key Vault Standard]
  api -->|Managed identity when needed| blob

  afd -. diagnostics .-> logs[Log Analytics and Application Insights]
  swa -. diagnostics .-> logs
  api -. diagnostics .-> logs
  blob -. diagnostics .-> logs
```

Azure Front Door is the only canonical public endpoint. Its routes are ordered
so the three blob content prefixes go to the storage origin and all remaining
paths go to Azure Static Web Apps. Azure Static Web Apps then proxies `/api/*`
to its linked Azure Container Apps backend. The browser therefore uses one
stable origin:

| Public contract | Destination |
| --- | --- |
| `https://<front-door-host>/*` | Azure Static Web Apps |
| `https://<front-door-host>/.auth/*` | Azure Static Web Apps authentication |
| `https://<front-door-host>/api/*` | Linked Azure Container Apps backend |
| `https://<front-door-host>/game-assets/*` | Blob container `game-assets` |
| `https://<front-door-host>/media/*` | Blob container `media` |
| `https://<front-door-host>/static-assets/*` | Blob container `static-assets` |

The blob prefixes deliberately avoid `/assets/*`, which Vite already uses for
the website's generated application bundles.

### Public ingress boundary

Azure Front Door Premium is selected instead of Standard because the baseline
requires the managed bot protection rule set. One WAF security policy covers
the canonical frontend, authentication, API, and content routes.

The development WAF uses detection mode during its tuning window. Production
is explicitly parameterized in prevention mode. The policy includes:

- Azure-managed default rule set `2.1`;
- managed bot rule set `1.1`;
- separate rate-limit rules for `/api/*`, `/.auth/*`, and general traffic; and
- one security-policy association covering `/*` on the canonical endpoint.

The protected mapping is explicit:

| Canonical Front Door path | Origin | Rate-limit layers |
| --- | --- | --- |
| `/*` | Azure Static Web Apps frontend | General |
| `/.auth/*`, `/login`, `/logout` | Static Web Apps authentication | Authentication and general |
| `/api`, `/api/*` | Static Web Apps linked Container App | API and general |
| `/game-assets/*`, `/media/*`, `/static-assets/*` | Microsoft Entra-protected Blob Storage | General |

Both environments use a five-minute rate-limit window. Development starts at
`2000` API, `1000` authentication, and `10000` general requests per socket IP.
Production starts at `1000`, `500`, and `5000`, respectively.

Rate-limit thresholds remain environment parameters because they require
traffic evidence. Azure Front Door rate limits are per socket IP address and
can admit some traffic above very low thresholds, so production values must be
calibrated rather than presented as exact security boundaries.

The catch-all frontend route does not enable Front Door caching, so
`/.auth/*`, `/api/*`, and authenticated content pass through uncached. The
three Blob Storage routes retain their explicit environment-aware cache
durations. A later measured optimization can add a distinct cache rule for
hashed Vite assets without widening caching to authentication or API paths.

### Frontend and authentication boundary

Azure Static Web Apps Standard hosts the existing `dist/` output. Standard is
required because linking an Azure Container Apps backend is not available on
the Free plan. It also leaves a path to custom authentication provider
registrations and a service-level agreement without changing hosting services.

The initial authentication integration is the built-in, Azure-managed
Microsoft Entra ID provider:

- Microsoft Entra OpenID Connect sign-in uses `/.auth/login/aad` and requires
  no application credential in the repository or Bicep parameters;
- the unused preconfigured GitHub provider is blocked;
- `staticwebapp.config.json` requires the `authenticated` role for `/api/*`;
- `/.auth/me` is the frontend identity contract; and
- the Static Web App has a system-assigned managed identity reserved for future
  least-privilege service access.

The API is linked to the static web app rather than exposed as a separate
browser origin. Azure Static Web Apps proxies the complete `/api` path and
configures the Container App with the `Azure Static Web Apps (Linked)` identity
provider so the container accepts linked proxy traffic by default. API code
must still authorize operations and must not trust a client-supplied identity
header outside that protected proxy boundary.

Azure Static Web Apps pull-request environments do not support linked backends.
End-to-end frontend-to-API validation therefore runs against the deployed
development environment, while pull-request environments remain suitable for
frontend-only review.

The managed Microsoft Entra provider can authenticate any Microsoft account it
accepts. Tenant, group, role, and operation authorization remain application
policy. Static Web Apps custom provider registrations require a client
credential, so the keyless baseline does not predeclare one. A later
tenant-restriction requirement can refine the provider configuration through a
separately reviewed design without replacing Static Web Apps, Container Apps,
Blob Storage, or Front Door.

Azure Front Door Private Link does not support Azure Static Web Apps as an
origin. Instead, the static web app is restricted to the
`AzureFrontDoor.Backend` service tag and requires the deployment's
`X-Azure-FDID` forwarding header and allowed Front Door hosts. This prevents the
generated `*.azurestaticapps.net` hostname from bypassing the canonical WAF
path after the frontend publisher merges the deployment's non-secret
forwarding-gateway output into `staticwebapp.config.json`. Until that
post-deployment artifact publication occurs, the generated hostname remains a
diagnostic bypass and the environment is not production-ready.

### API and container registry boundary

Azure Container Apps hosts the future Docker-based API in a consumption
workload profile. HTTP scaling and explicit replica limits provide a bounded
serverless starting point:

| Environment | Minimum replicas | Initial maximum | Starting allocation |
| --- | ---: | ---: | --- |
| `dev` | 0 | 2 | 0.25 vCPU, 0.5 GiB |
| `prod` | 1 | 5 | 0.5 vCPU, 1 GiB |

These are safe budget defaults, not capacity evidence. Production keeps one
warm replica to avoid user-facing cold starts; development can scale to zero.
Load and latency telemetry determine later changes.

Azure Container Registry Basic is the initial private registry because the
expected image count and deployment concurrency are low. A user-assigned
managed identity receives only the `AcrPull` role and is used by Container Apps
for image pulls. Registry administrative credentials and anonymous pulls stay
disabled.

Basic registry networking remains public because private endpoints require the
Premium registry tier. Upgrade to Premium only when private registry ingress,
geo-replication, or measured image throughput requires it. This is an explicit
cost-versus-network-isolation tradeoff; authentication still uses Microsoft
Entra role-based access control rather than registry passwords.

### Asset boundary

A general-purpose v2 storage account provides three private blob containers:

- `game-assets` for independently packaged game content;
- `media` for user-facing images and media; and
- `static-assets` for other non-application static files.

Anonymous blob access is disabled at the account level. Azure Front Door
Premium uses its system-assigned managed identity and `Storage Blob Data Reader`
role to authenticate to the blob service. Azure Front Door origin
authentication does not currently support Private Link origins, so the storage
public endpoint remains network reachable while anonymous access and Shared Key
authorization remain disabled. Direct unauthenticated requests cannot read the
containers. Upload automation uses a separate Microsoft Entra role with
`Storage Blob Data Contributor` on the dedicated asset account; the GitHub
publisher uses OpenID Connect federation and never uses account keys, Shared
Access Signatures, or a client secret.

Development starts with locally redundant storage. Production starts with
zone-redundant storage in `eastus2`. Geo-redundancy is deferred until recovery
objectives justify its replication and egress costs.

### Secrets and management boundary

Azure Key Vault Standard stores runtime secrets that cannot be replaced by
managed identity. The API uses a dedicated user-assigned identity with only Key
Vault Secrets User on its environment vault. Container Apps accepts only a
secret alias plus versionless Key Vault URI, resolves it with that identity,
and injects the value only at runtime. A separate publication-only identity has
Key Vault Secrets Officer and OpenID Connect federation to the matching
protected GitHub environment. Secret values are never committed, emitted as
Bicep outputs, or passed as plain command-line parameters.

GitHub Actions deployment later uses OpenID Connect federation to Azure rather
than a long-lived client secret. Separate deployment identities and resource
groups keep development and production permissions distinct. The infrastructure
deployment identity receives only the control-plane and role-assignment
permissions required by the declared resources.

## Environment Strategy

Both environments use the same modules and route topology. Parameters change
capacity, retention, resilience, WAF rollout mode, and resource names.

| Decision | `dev` | `prod` |
| --- | --- | --- |
| Lifecycle | On-demand full stack | Persistent |
| Azure Front Door | Premium; detection while tuning | Premium; prevention required |
| Static Web Apps | Standard | Standard |
| Container Apps | Scale to zero, bounded at 2 | One warm replica, bounded initially at 5 |
| Container Registry | Basic | Basic; upgrade on measured need |
| Blob redundancy | Locally redundant | Zone redundant |
| Log retention and cap | 30 days, 1 GB/day | 30 days, 5 GB/day initially |
| Application sampling | 100% for short-lived debugging | 25% baseline |
| Key Vault recovery | 7 days, purge protection off | 90 days, purge protection on |
| WAF thresholds | Higher tolerance for test traffic | Calibrated from production telemetry |
| Resource sharing | None with production | None with development |

Each deployment carries environment, application, owner, cost-center,
repository, lifecycle, data-classification, and cost-profile tags. Replica
ceilings, recovery windows, sampling, and a Log Analytics daily ingestion cap
are enforceable environment cost guardrails. Cost Management notification
recipients and alert binding remain deployment-time operational configuration;
budgets report spend but do not stop resource consumption. Deleting the
development resource group is the supported cleanup operation; shared
cross-environment data must not be placed in it.

## Cost Topology and Tradeoffs

Exact prices vary by agreement, region, traffic, and date, so the deployment
documentation must use the Azure pricing calculator before production approval
rather than commit a misleading dollar total.

| Service | Cost shape | Baseline control |
| --- | --- | --- |
| Azure Front Door Premium and WAF | Dominant fixed profile charge plus requests, WAF processing, data transfer, and diagnostic ingestion | Reuse one protected profile per environment; deploy development on demand |
| Azure Static Web Apps Standard | Fixed plan charge plus plan limits and overages | One app per environment; use staging environments for frontend-only review |
| Azure Container Apps | vCPU, memory, requests, and log volume | Scale development to zero; cap replicas in every environment |
| Azure Container Registry Basic | Daily registry charge plus excess storage and transfer | Basic tier, image cleanup policy in deployment automation |
| Blob Storage | Stored bytes, operations, and transfer | LRS in development, ZRS in production, bounded soft-delete retention, and no versioning or automatic tier movement without measured need |
| Key Vault Standard | Operations and optional premium key features | Store only required secrets; prefer managed identity |
| Log Analytics and Application Insights | Ingested data and retention | Sampling, 30-day baseline retention, a Log Analytics daily cap, and stable diagnostic outputs for later alerts |

Front Door Premium is intentionally the largest baseline commitment. Replacing
it with Standard would remove managed bot protection, while separate edge
products would duplicate routing and certificate operations. The Premium
choice buys one protected canonical endpoint and managed-identity access to
private blob containers.

The initial topology is single-region and does not promise regional failover.
Adding a second Container Apps environment or storage origin would increase
availability and cost and requires an explicit recovery objective first.

## Operations and Observability

The baseline includes a Log Analytics workspace and workspace-based Application
Insights resource per environment. The Container Apps environment selects the
Azure Monitor destination, avoiding any Log Analytics workspace key.
Diagnostic settings collect:

- Azure Front Door access, health probe, WAF logs, and metrics;
- Static Web Apps logs and metrics;
- Container Registry repository/login logs and metrics;
- Container Apps system and application console logs plus app metrics;
- blob transaction/authentication logs and metrics; and
- Key Vault audit events and metrics.

Azure activity logs and continuous deployment logs retain control-plane
deployment evidence separately from resource diagnostics.

The non-secret monitoring output identifies every diagnostic setting so later
alert automation can bind repeated WAF blocks, API error rate and latency, zero
healthy API replicas, failed revisions, storage authorization failures, and
budget thresholds without discovery or hard-coded personal addresses.

Immutable assets use content-hashed names. Deployments purge only changed
mutable Front Door paths. Health probes use a lightweight unauthenticated API
health route that reveals no dependency or secret details.

## Deployment Shape and Outputs

The later Bicep entry point must be subscription scoped so it can create the
environment resource group and all child resources declaratively. A repeated
deployment with the same parameters must converge. The expected order is:

1. resource group, monitoring, and identities;
2. storage, Key Vault, registry, and Container Apps environment;
3. Container App, Static Web App, and linked API backend;
4. Front Door routes, managed blob-origin authentication, and WAF policy; and
5. Static Web Apps forwarding-gateway restrictions using the Front Door ID.

Deployment outputs expose non-secret application and automation contracts:

- canonical Front Door endpoint and resource ID;
- WAF policy, Front Door security policy, and Front Door instance identifiers;
- protected path, managed rule, rate-limit, origin, and Static Web Apps forwarding-gateway contracts;
- frontend resource name and generated hostname for diagnostics;
- stable public API base URL ending in `/api`;
- public content base URLs for all three blob categories;
- Static Web App and Container App resource IDs;
- Container App diagnostic fully qualified domain name;
- registry resource ID and login server;
- storage account resource ID, blob endpoint, and container names;
- Key Vault resource identity, URI, recovery policy, and unresolved references,
  never secret values;
- managed identity resource, client, principal, federation, and role-assignment
  identifiers;
- Log Analytics workspace, Application Insights, diagnostic-setting, retention,
  sampling, and ingestion-cap metadata;
- API scaling, storage and vault recovery, tag, and monitoring cost controls;
  and
- authentication mode, provider login paths, and non-secret client identifiers
  when custom authentication is enabled.

Storage keys, registry credentials, deployment tokens, provider secrets, and
connection strings are forbidden outputs.

Every preview and deployment command must select subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed` explicitly before running Bicep
validation, `what-if`, or deployment.

## Requirement Traceability

| Issue requirement | Baseline decision | Implementation story |
| --- | --- | --- |
| Organize resources with Bicep modules | Subscription entry point and bounded service modules | US-002 |
| Host the static frontend | Azure Static Web Apps Standard behind Front Door | US-003 |
| Support website authentication | Static Web Apps authentication and route roles | US-006 |
| Host a Docker-based API | Linked Azure Container Apps backend and Azure Container Registry | US-004 |
| Store game assets and media | Private general-purpose v2 blob storage containers | US-005 |
| Put content delivery in front of assets | Front Door Premium blob routes with managed origin authentication | US-005 |
| Protect against bots and abusive traffic | Front Door Premium WAF managed bot and rate-limit rules | US-007 |
| Keep configuration environment aware | Separate resource groups and shared modules with explicit parameters | US-002 and US-008 |
| Expose deployment configuration | Non-secret service, endpoint, identity, and monitoring outputs | US-002 through US-008 |
| Avoid committed secrets | Managed identity, Key Vault, and federated deployment identity | US-008 |
| Make deployment repeatable | Idempotent Bicep, deterministic role assignments, and documented `what-if` | US-002 and US-009 |

## Alternatives Not Selected

- **Static website hosting in Blob Storage:** cheaper, but loses the selected
  Static Web Apps authentication and linked API boundary.
- **Azure Static Web Apps Free:** cannot link the Container Apps backend and
  has no production service-level agreement.
- **Direct browser access to Container Apps:** introduces a second public
  origin and a separate authentication and cross-origin resource sharing
  boundary.
- **Azure Front Door Standard:** supports custom rate limiting but not the
  selected managed bot rule set.
- **Azure Front Door Private Link for the blob origin:** provides network
  isolation but currently cannot be combined with managed origin
  authentication. Using it would require anonymous blob access or a stored
  authorization value, neither of which matches the baseline security model.
- **Azure Kubernetes Service:** adds cluster operations and idle capacity before
  the API requires that control.
- **Azure Container Registry Premium:** provides private endpoints and
  geo-replication, but its fixed cost is not justified by the baseline image
  volume.
- **A shared development and production resource group:** lowers resource
  count but weakens deletion safety, permissions, budgets, and blast-radius
  isolation.

## Authoritative References

- [Azure Static Web Apps hosting plans](https://learn.microsoft.com/azure/static-web-apps/plans)
- [Azure Static Web Apps authentication and authorization](https://learn.microsoft.com/azure/static-web-apps/authentication-authorization)
- [Link Azure Container Apps as a Static Web Apps API](https://learn.microsoft.com/azure/static-web-apps/apis-container-apps)
- [Configure Azure Front Door manually for Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/front-door-manual?pivots=swa-afd-manual-afd)
- [Azure Front Door managed origin authentication](https://learn.microsoft.com/azure/frontdoor/origin-authentication-with-managed-identities)
- [Azure Front Door WAF bot protection](https://learn.microsoft.com/azure/web-application-firewall/afds/waf-front-door-policy-configure-bot-protection)
- [Azure Front Door WAF rate limiting](https://learn.microsoft.com/azure/web-application-firewall/afds/waf-front-door-rate-limit)
- [Azure Container Apps scaling](https://learn.microsoft.com/azure/container-apps/scale-app)
- [Managed identity image pulls from Azure Container Registry](https://learn.microsoft.com/azure/container-apps/managed-identity-image-pull)
- [Azure Container Registry service tiers](https://learn.microsoft.com/azure/container-registry/container-registry-skus)
- [Prevent anonymous Blob Storage access](https://learn.microsoft.com/azure/storage/blobs/anonymous-read-access-prevent)
