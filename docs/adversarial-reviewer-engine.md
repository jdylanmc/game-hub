# Azure adversarial reviewer engine

`scripts/review-adversarial-context.ts` consumes a ready packet produced by
`yarn context:collect` and returns a strict adversarial finding result. Azure
deployment, workflow orchestration, and GitHub publication remain later stories.

## Authentication and destination

The live transport uses `DefaultAzureCredential` from Azure Identity and
requests a Microsoft Entra ID token for
`https://cognitiveservices.azure.com/.default`. It sends only an
`Authorization: Bearer` header; Azure OpenAI API-key environment variables are
rejected.

Set validated environment configuration:

```text
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_ID=game-hub-unit-test-reviewer
```

The endpoint must use HTTPS, have no credentials, port, query, fragment, or
extra path, and end in `.openai.azure.com`. The deployment ID must match the
reviewed engine configuration.

## Prompt and evidence isolation

The request has three distinct messages:

1. `.github/adversarial-agents/system-policy.md` as the highest-priority system
   policy, with a validated version and SHA-256 hash;
2. the independently versioned human-tunable unit-test reviewer prompt as a
   developer message;
3. the canonical context packet as a length- and hash-delimited untrusted user
   message.

No tools are registered. Pull-request content cannot change the system policy,
review prompt, transport, destination, or tool boundary.

## Limits and failure behavior

`config/adversarial-agents/reviewer-engine.json` pins:

- context, estimated input, output-token, timeout, retry, concurrency, and
  estimated per-review cost limits;
- the API version, Microsoft Entra ID scope, deployment ID, allowed endpoint,
  system policy, and empty tool allowlist;
- conservative input/output token rates used only to enforce the local cost
  ceiling.

Only explicitly classified transient network failures and HTTP 408, 429, 500,
502, 503, or 504 responses retry. Retries reuse the same deeply frozen request
and original evidence. Authentication, validation, policy, other HTTP, timeout,
and budget failures do not retry.

Malformed JSON, schema-invalid or missing output, supplied verdict/count
mismatches, blocked context, timeout, network/model failure, and token/cost
breaches return a schema-valid blocking `ERROR` result. Valid findings are
deduplicated deterministically before counts and verdict are derived from
policy.

Run locally after Azure resources and identity are available:

```bash
yarn review:adversarial --input review-context.json --output review-result.json
```

Unit tests inject a fake transport and require no Azure resource, credentials,
network, or live deployment.

## Official references

- [Azure Identity for JavaScript](https://learn.microsoft.com/javascript/api/overview/azure/identity-readme)
- [Azure OpenAI Microsoft Entra ID authentication](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/managed-identity)
- [Azure OpenAI structured outputs](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/structured-outputs)
