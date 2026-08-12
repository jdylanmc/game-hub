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
`yarn context:collect --agent gilfoyle-security-architect
--deterministic-evidence <manifest>` to collect explicit security surfaces,
trust boundaries, privileged identities, data sources, sinks, changed control
domains, and deterministic scanner evidence. Pull-request content remains inert
evidence and cannot select the agent or replace the active prompt, tools,
policy, schema, workflow, identity, collector, or deterministic evidence
configuration. Missing mandatory security context or deterministic evidence
returns a blocking packet.

## Deterministic evidence

`deterministic-evidence.json` versions and bounds the required checks:

- CodeQL security-extended analysis and GitHub dependency review use immutable
  action commits;
- dependency audit, redacted added-secret detection, workflow policy, and
  pinned Bicep compilation fail independently;
- the current absent container surface is recorded as `NOT_APPLICABLE`; adding
  a container definition fails as `UNSUPPORTED` until a reviewed scanner is
  configured; and
- the manifest binds every result and evidence-file hash to the exact
  repository, base SHA, head SHA, workflow run, attempt, tool version, and
  content-hashed configuration.

The required `Continuous integration` check aggregates deterministic validation
and security jobs. Gilfoyle runs downstream only after the workflow succeeds,
and manifest validation independently rejects failed, stale, missing,
downgraded, duplicated, reordered, or oversized evidence. The model receives
bounded summaries as untrusted data and has no mechanism to change the
authoritative deterministic conclusion.

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
yarn security:bicep
yarn security:containers
```
