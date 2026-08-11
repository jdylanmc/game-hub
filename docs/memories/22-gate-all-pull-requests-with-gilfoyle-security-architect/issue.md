# Issue #22: Gate All Pull Requests with Gilfoyle Security Architect

- Repository: `jdylanmc/game-hub`
- URL: https://github.com/jdylanmc/game-hub/issues/22
- State: Open
- Labels: `priority:P0`, `type:non-functional`, `area:website`

## Goal

Require the Gilfoyle Security Architect adversarial agent to review every pull
request and block merging when its required security check does not pass.

Gilfoyle is the first security-specialized agent registered on the shared
Azure-hosted adversarial-agent platform established by issue #30. It owns a
dedicated, human-editable, versioned prompt that can be tuned independently from
its schema, policy, tools, model deployment, and blocking thresholds.

## Requirements

- Review every pull request targeting protected branches.
- Cover application code, game workspaces, infrastructure as code, workflows,
  dependencies, containers, contracts, manifests, and configuration.
- Fail closed when review is missing, canceled, timed out, malformed,
  unavailable, internally failing, or reports blocking security findings.
- Block high and critical findings plus uncertainty about a security-control
  bypass. Treat medium findings as advisory.
- Use least privilege, immutable action references, OpenID Connect, bounded
  tools and network, and no pull-request secrets or code execution.
- Publish concise actionable check annotations with file and line context plus
  a retained structured JSON artifact.
- Preserve evidence without leaking secrets or sensitive content.
- Prevent path filters, draft state, or service outages from creating an
  unreviewed merge path.
- Integrate deterministic security evidence without overriding or masking its
  failures.

## Pull-Request Experience

- Distinguish blocking findings, advisory findings, configuration failures,
  invalid output, and service outages.
- Provide locally reproducible investigation and remediation guidance.
- Permit emergency exceptions only with authorized approval, exact scope,
  finding fingerprint, issue, justification, audit evidence, and expiration no
  later than 24 hours.
- Keep administrators subject to the required check except for a separately
  audited emergency procedure.

## Acceptance Criteria

- Every pull request receives a Gilfoyle Security Architect check.
- Missing, pending, failed, canceled, malformed, unavailable, or blocking
  results prevent merge.
- Fork-originated pull requests receive no privileged secrets or write-capable
  tools.
- Workflow and Bicep changes are reviewed.
- Action versions, permissions, prompt, tools, model, schema, and policy are
  versioned and attributable.
- Failure behavior, severity thresholds, remediation, emergency exceptions,
  outage handling, and prompt tuning are documented.
- Branch protection requires Gilfoyle and is reproducibly verified.

## Confirmed Design Decisions

- Build Gilfoyle as a custom agent on issue #30's shared Azure adversarial-agent
  platform rather than integrating a third-party Gilfoyle action.
- Use a dedicated human-tunable prompt file with an explicit version and
  content hash in every result.
- Block high and critical findings and any uncertainty about a security-control
  bypass; keep medium findings advisory.
- Limit emergency exceptions to 24 hours.
- Reuse Azure-hosted GPT-4.1 mini, OpenID Connect, structured findings, retained
  JSON evidence, and horizontally isolated agent registration from issue #30.
