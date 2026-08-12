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
