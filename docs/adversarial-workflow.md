# Fork-safe adversarial review workflow

`.github/workflows/adversarial-review.yml` is the downstream orchestration for
the model-backed reviewer. US-007 defines and tests the workflow but does not
deploy Azure, create identities, enable branch protection, or publish a live
review.

## Trust boundary

The workflow uses GitHub's `workflow_run` event for the completed
`Continuous integration` workflow. GitHub loads a `workflow_run` workflow from
the default branch, and this workflow additionally checks out the explicit
protected `github.sha` from `main`.

Model work is eligible only when:

- the triggering workflow name and path exactly match the canonical
  deterministic workflow;
- the event is a completed pull-request run with conclusion `success`;
- the current open pull request still targets `jdylanmc/game-hub:main`;
- the triggering workflow head SHA still equals the current pull-request head;
- exactly one source issue is attributable; and
- at least one changed path is relevant to code, tests, validation,
  infrastructure, or workflow behavior.

Failed, missing, canceled, ambiguous, stale, or irrelevant inputs cannot reach
Azure authentication or model invocation.

## Untrusted pull-request evidence

The workflow never checks out the pull-request branch or runs its scripts,
workflows, package manifests, dependencies, or tests. It installs dependencies
only from protected base code. Validated fork metadata produces a fixed
`https://github.com/<owner>/<repository>.git` URL, and Git fetch retrieves only
the exact base and head commit objects without changing `HEAD`.

The bounded collector then reads those objects with external diffs, text
conversion, hooks, and repository code execution disabled. Pull-request and
issue text remain untrusted evidence.

## Identity, permissions, and capacity

The metadata job has only `contents`, `issues`, and `pull-requests` read
permissions. The review job adds only:

- `checks: write` for the exact-head publisher; and
- `id-token: write` for the `adversarial-review` environment's Microsoft Entra
  ID federated identity.

The inference principal must have only the declarative Cognitive Services
OpenAI User role on the configured Azure OpenAI account. The reviewer rejects
API keys, unexpected deployments, tools, and endpoints outside
`https://*.openai.azure.com`.

Pull-request numbers map deterministically to three GitHub concurrency lanes.
Each lane permits one active review, so at most three reviews execute
simultaneously without shared mutable state. Queued stale runs revalidate the
current head before Azure access, and every run revalidates again immediately
before publication.

## Fail-closed ordering

The workflow:

1. resolves a successful exact-SHA deterministic run;
2. checks out and installs protected base code;
3. revalidates current pull-request metadata;
4. requires a currently promotable calibration report;
5. fetches Git objects and collects bounded evidence;
6. validates the inference endpoint and authenticates with OpenID Connect;
7. invokes the bounded reviewer;
8. revalidates the current head;
9. publishes the check and evidence; and
10. independently fails the workflow when the published, exception-aware
    conclusion is `failure`.

Reviewer `FAIL` and `ERROR` results are published before the workflow fails.
Unexpected errors, missing output, artifact failures, timeouts, and publication
failures also fail the workflow. The downstream check cannot replace, override,
or run without the successful deterministic check for the same SHA.

Evidence is retained for 90 days. All action references are immutable full
commit SHAs.

## Exact exceptions

Exceptions are protected-base data in
`config/adversarial-agents/exceptions.json`; pull-request content cannot create
or modify an exception used by its run. Each exception must identify one
current high-confidence blocking finding by exact agent/version, repository,
head SHA, reviewer-result fingerprint, and finding-content fingerprint. It also
requires an owner, independent approver, rationale, issue, approval comment URL,
approval-record hash, integrity hash, and expiry no more than seven days after
approval.

Malformed, expired, future-excessive, wildcard, unrelated, cross-agent,
cross-SHA, tampered, duplicate, or replayed entries fail publication closed.
The original validated reviewer result is never rewritten: retained evidence
records the finding plus immutable exception application and audit
fingerprints. An excepted finding becomes a warning and cannot suppress another
agent's check. Any unexcepted blocking finding still fails its agent check.

Validate the protected registry locally:

```bash
yarn exceptions:validate
```

## Operations and reproduction

- **Transient failures:** retry only the identified HTTP statuses in
  `reviewer-engine.json` (408, 429, 500, 502, 503, and 504), honor bounded
  backoff, and preserve the exact evidence. Do not retry schema, policy,
  authentication, destination, or other non-transient failures.
- **Quota and cost:** leave the run failed/queued rather than raising
  concurrency above the registered maximum. Check Azure quota and the
  Consumption budget alerts; do not increase token, cost, or three-review
  limits during an incident.
- **Model incidents:** stop model-backed runs, preserve deterministic
  Continuous integration, retained evidence, deployment/version attribution,
  and Azure incident details. Never substitute an unregistered deployment.
- **Prompt rollback:** revert the prompt and its registered hash/version
  together, recalibrate the exact resulting fingerprint, review the change on
  protected `main`, and only then replace the active calibration report.
- **Local reproduction:** from protected base code, collect the exact Git
  objects with `yarn context:collect`, run `yarn review:adversarial` with
  Microsoft Entra ID environment values, validate the JSON with
  `node scripts/validate-adversarial-finding.ts reviewer-result.json`, and
  evaluate protected exceptions with
  `node scripts/apply-adversarial-exceptions.ts --result reviewer-result.json --repository jdylanmc/game-hub --issue 30 --head <sha> --exceptions config/adversarial-agents/exceptions.json`.

## Registering another reviewer

Every reviewer registration must have its own immutable prompt, bounded-tools
contract, output schema, policy, engine configuration, benchmark corpus,
promotion policy, active calibration report path, check name, state namespace,
and concurrency limit.
Run `yarn agents:validate` after updating
`config/adversarial-agents/agents-config.json`. Runtime selection uses
`ADVERSARIAL_AGENT_NAME`; output validation and publication bind to that exact
registration. Shared paths, checks, calibration, or state namespaces are
rejected so one reviewer cannot suppress, rewrite, or impersonate another.

## Live protected identity

The workflow invokes Azure only when protected `main` contains:

- `config/adversarial-agents/active-calibration-unit-test-reviewer.json`,
  produced by a real Azure run and passing `yarn calibration:check`;
- the protected `adversarial-review` GitHub environment;
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_OPENAI_ENDPOINT` environment
  variables;
- an environment-scoped OpenID Connect federated credential using GitHub's
  immutable owner and repository IDs; and
- the narrow model-invocation role assignment.

The infrastructure deployment workflow remains manually dispatched from
protected `main` through the protected `test` or `prod` environment. Federated
credentials are independently reconciled through
`infra/deploy-federated-identity.sh` because the deployment identities do not
have Microsoft Graph application-write permission.

References:

- [GitHub `workflow_run` events](https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [GitHub secure use reference](https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- [GitHub OpenID Connect with Azure](https://docs.github.com/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-azure)
