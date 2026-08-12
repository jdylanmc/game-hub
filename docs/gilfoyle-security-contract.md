# Gilfoyle security contract

Gilfoyle is the security-specialized reviewer on the shared adversarial-agent
platform. Its registration is deliberately disabled during the contract story;
later stories add security context, deterministic evidence, calibration,
workflow publication, exceptions, and branch protection.

## Independent attribution

`config/adversarial-agents/agents-config.json` gives Gilfoyle independent,
content-hashed prompt, schema, policy, tools, engine, benchmark, promotion,
calibration, check, and state paths. A result identifies the agent, model
deployment and version, prompt version and hash, schema version and hash, policy
version and hash, tools version, repository commit, and timestamp.

Gilfoyle also owns the independently versioned and content-hashed bounded
context profile at
`config/adversarial-agents/gilfoyle-security-architect/context.json`. Run
`yarn context:collect --agent gilfoyle-security-architect` to collect explicit
security surfaces, trust boundaries, privileged identities, data sources,
sinks, and changed control domains. Pull-request content remains inert evidence
and cannot select the agent or replace the active prompt, tools, policy, schema,
workflow, identity, or collector behavior. Missing mandatory security context
returns a blocking packet.

The model is Azure-hosted GPT-4.1 mini. The registered engine permits no model
tools, pull-request code execution, write capability, or network destination
other than the reviewed Azure OpenAI endpoint.

## Finding contract

Every finding requires:

- confidence and a category from the security taxonomy;
- security severity and an explicit security-control bypass assessment;
- an exact file, line range, and non-sensitive snippet;
- an exploit or failure scenario;
- impact;
- root-cause remediation; and
- verification guidance.

Credential, token, key, connection-string, certificate, and secret values are
forbidden in findings and retained evidence.

## Blocking policy

One finding is enough to block when:

- `securitySeverity` is `CRITICAL` or `HIGH`; or
- `securityControlBypass` is `CONFIRMED` or `UNCERTAIN`.

Confidence is mandatory but cannot downgrade those thresholds. `MEDIUM` and
`LOW` findings remain advisory when `securityControlBypass` is `NONE`. Missing
context, malformed output, invalid attribution, timeout, cancellation, service
outage, or internal failure produces a blocking `ERROR`.

Validate the protected contract locally:

```bash
yarn agents:validate
yarn policy:gilfoyle
```
