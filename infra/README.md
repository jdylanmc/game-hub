# Game Hub Azure Infrastructure

The `infra/` directory is the declarative deployment boundary for Game Hub.
`main.bicep` is a subscription-scope entry point that creates one resource
group per environment and composes bounded modules at their required scopes.
Reusing the same entry point and parameter file converges on the same resource
names; no timestamp, random name, imperative resource creation command, or
Azure portal step is part of the deployment path.

The current stack creates the environment resource group, an Azure Static Web
Apps Standard frontend, Azure Container Registry Basic, and an Azure Container
Apps consumption environment and application boundary for the future
application programming interface (API). Later issue #1 stories add assets,
canonical ingress, authentication configuration, secure runtime references,
and observability behind the existing module boundaries.

## Layout

| Path | Responsibility |
| --- | --- |
| `main.bicep` | Subscription orchestration, required tags, module composition, and non-secret outputs |
| `modules/resource-group.bicep` | Resource group lifecycle at subscription scope |
| `modules/foundation.bicep` | Resource-group-scoped deterministic service names and output contract |
| `modules/static-web-app.bicep` | Azure Static Web Apps Standard frontend and Vite artifact publication contract |
| `modules/container-registry.bicep` | Azure Container Registry Basic, pull-only managed identity, and scoped `AcrPull` assignment |
| `modules/container-app-api.bicep` | Azure Container Apps environment, API revision, ingress, scaling, settings, and runtime identity |
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
registry, and identity deployment contracts. They must never contain storage
keys, registry credentials, deployment credentials, provider secrets,
connection strings, or resolved secret values.

## Frontend hosting

`modules/static-web-app.bicep` declares Azure Static Web Apps Standard without a
repository token or generated workflow. The deterministic resource name comes
from the foundation module. Both environments accept application configuration
updates from the committed `staticwebapp.config.json`; development enables
preview staging environments, while production disables them until a reviewed
release process needs them. The separate Azure Front Door and web application
firewall story will later establish the canonical protected public endpoint.

The subscription deployment returns these non-secret frontend outputs:

| Output | Use |
| --- | --- |
| `frontendResourceId` | Role assignments and later service links |
| `frontendResourceName` | Content publication target |
| `frontendDefaultHostname` | Generated hostname without a scheme |
| `frontendEndpoint` | Direct HTTPS diagnostic endpoint |
| `frontendDeployment` | Subscription, resource group, app name, build command, artifact path, configuration path, and production environment |

These outputs do not prove that the resource or content exists. They are
available only after an actual Azure deployment, which this repository change
does not perform.

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

The direct Container App endpoint is diagnostic. Azure Front Door and the
Static Web Apps linked-backend story will establish the canonical browser API
base URL. These outputs do not prove that the registry, environment, app,
image, or endpoint exists. They are available only after an actual Azure
deployment, which this repository change does not perform.
