# Game Hub Azure Infrastructure

The `infra/` directory is the declarative deployment boundary for Game Hub.
`main.bicep` is a subscription-scope entry point that creates one resource
group per environment and composes bounded modules at their required scopes.
Reusing the same entry point and parameter file converges on the same resource
names; no timestamp, random name, imperative resource creation command, or
Azure portal step is part of the deployment path.

This foundation currently creates only the environment resource group and its
stable naming contract. Later issue #1 stories add the frontend, application
programming interface (API), assets, ingress, identity, and observability
resources behind the existing module boundary.

## Layout

| Path | Responsibility |
| --- | --- |
| `main.bicep` | Subscription orchestration, required tags, module composition, and non-secret outputs |
| `modules/resource-group.bicep` | Resource group lifecycle at subscription scope |
| `modules/foundation.bicep` | Resource-group-scoped deterministic service names and output contract |
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
identity, required tags, and deterministic future resource names. They must
never contain storage keys, registry credentials, deployment tokens, provider
secrets, or connection strings.
