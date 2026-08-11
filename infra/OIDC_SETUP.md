# Protected GitHub OpenID Connect setup

Live identity creation is deferred to US-009. This document records the
required trust and role boundaries without imperatively changing GitHub.

## Trust subjects

Create separate Microsoft Entra ID applications or service principals for
deployment and inference. Federated credentials may target only protected
GitHub environments:

```text
repo:jdylanmc/game-hub:environment:test
repo:jdylanmc/game-hub:environment:prod
```

Do not add pull-request, feature-branch, wildcard-branch, or unprotected
environment subjects.

In GitHub, restrict both environments to the `main` deployment branch and
require manual reviewers. Store the client ID, tenant ID, and reviewer object
ID as environment variables. They are identifiers, not secrets.

## Azure roles

1. An Azure administrator deploys
   `infra/bicep/bootstrap-deployment-role.bicep` once to define and assign the
   narrow custom deployment role.
2. The normal subscription deployment creates the Azure OpenAI account and
   declaratively assigns **Cognitive Services OpenAI User** to the separate
   reviewer identity.
3. Do not grant Contributor, Owner, Key Vault roles, or Azure OpenAI key access
   to either runtime identity.

The Azure OpenAI account sets `disableLocalAuth: true`; runtime inference must
request a Microsoft Entra ID token for `https://cognitiveservices.azure.com/.default`.

## Deployment workflow

The workflow is `workflow_dispatch` only, runs only from `main`, and enters the
selected protected environment before Azure login. It does not deploy from pull
requests, create federated credentials, read model keys, or write repository
secrets.

See [Configure a federated identity credential](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust)
and [GitHub OpenID Connect with Azure](https://learn.microsoft.com/azure/developer/github/connect-from-azure).
