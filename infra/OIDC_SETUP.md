# Protected GitHub OpenID Connect setup

The three Microsoft Entra ID applications predate their Bicep identity
definitions. They were onboarded once by assigning each application's immutable
`uniqueName`; Bicep now owns the federated credentials.

## Trust subjects

Create separate Microsoft Entra ID applications or service principals for
deployment and inference. Federated credentials may target only protected
GitHub environments:

```text
repo:jdylanmc@6954990/game-hub@1330993568:environment:adversarial-review
repo:jdylanmc@6954990/game-hub@1330993568:environment:test
repo:jdylanmc@6954990/game-hub@1330993568:environment:prod
```

Do not add pull-request, feature-branch, wildcard-branch, or unprotected
environment subjects. Do not restore the mutable
`repo:jdylanmc/game-hub:...` form.

In GitHub, restrict all three environments to protected branches. Require
manual reviewers for `test` and `prod`. Store the client ID, tenant ID, reviewer
object ID, and Azure OpenAI endpoint as environment variables where applicable.
They are identifiers, not secrets.

## Declarative credential deployment

The existing applications use these immutable Graph `uniqueName` values:

```text
game-hub-adversarial-inference
game-hub-adversarial-deploy-test
game-hub-adversarial-deploy-prod
```

Microsoft's Graph Bicep onboarding procedure requires a one-time Graph `PATCH`
to set `uniqueName` on an application created outside Bicep. After onboarding,
build and deploy the exact environment credential through the pinned script:

```bash
./infra/deploy-federated-identity.sh adversarial-review
./infra/deploy-federated-identity.sh test
./infra/deploy-federated-identity.sh prod
```

The script explicitly selects subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed`, verifies the active subscription,
previews the deployment, and applies the idempotent Microsoft Graph Bicep
resource. Azure currently reports `ExtensibleResourceNotSupported` for the
Graph resource during what-if, so exact Graph readback and a successful repeat
deployment are the convergence proof.

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

The infrastructure workflow is `workflow_dispatch` only, runs only from `main`,
and enters the selected protected environment before Azure login. It does not
deploy from pull requests, create federated credentials, read model keys, or
write repository secrets. Federated identity maintenance remains a separate
administrator deployment because the narrow deployment identities do not have
Microsoft Graph application-write permission.

See [Configure a federated identity credential](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust)
and [Migrate GitHub Actions federated credentials to immutable subjects](https://learn.microsoft.com/entra/workload-id/workload-identities-github-immutable-subjects)
and [GitHub OpenID Connect with Azure](https://learn.microsoft.com/azure/developer/github/connect-from-azure).
