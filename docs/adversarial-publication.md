# Adversarial review publication

US-006 provides a reusable publisher only. It does not add a GitHub Actions
workflow, publish pull request comments, deploy Azure resources, or change
branch protection.

## Publication contract

`yarn publish:adversarial` accepts only a schema- and policy-valid reviewer
result for the explicitly supplied pull request head commit. The command also
requires a calibration report that passes the versioned promotion policy.

The publisher:

- lists check runs for the exact commit and agent-specific check name;
- creates the check when none exists or updates the sole matching check;
- fails closed when duplicate checks, stale commits, invalid attribution, or
  GitHub application programming interface (API) failures are observed;
- maps PASS to `success`, critic-confirmed or platform FAIL to `failure`, and
  compute-only INCONCLUSIVE to `neutral`; advisory findings remain warnings on
  a successful PASS;
- sends at most 50 annotations per Checks API request, as required by
  [GitHub's check-run documentation](https://docs.github.com/rest/checks/runs);
- deduplicates finding content by stable SHA-256 fingerprints;
- appends only novel annotations on reruns and records superseded run/finding
  fingerprints in the check output and retained manifest.

GitHub does not provide an API to delete annotations from an existing check
run. Therefore the current retained artifact is authoritative after
supersession; old annotations remain historical evidence and are explicitly
identified as superseded.

Creating or updating check runs requires a GitHub App installation token with
checks write permission. Unit tests use an injected fake transport and require
no live token or network.

## Evidence bundle

Every successful publication writes:

1. an immutable, run-fingerprinted JSON evidence artifact containing the
   complete revalidated reviewer result; and
2. one agent/head manifest that points to the active artifact and records its
   SHA-256 and byte length.

The bundle attributes the issue, pull request, repository, exact head SHA,
agent, model deployment, prompt version/hash, schema, policy, tools,
calibration, review/publication timestamps, tokens, estimated cost, latency,
and supersession state. Retention is explicitly configured for 90 days.

Credential-like values are replaced with
`[REDACTED:SENSITIVE_CONTENT]`, after which the result is validated again.
Bundle validation checks content hashes, sizes, attribution, retention, safe
filenames, reviewer schema/policy, and absence of recognized sensitive values.

Example for the later protected workflow:

```bash
GITHUB_TOKEN=<github-app-installation-token> \
yarn publish:adversarial \
  --result reviewer-result.json \
  --repository jdylanmc/game-hub \
  --issue 30 \
  --head "$HEAD_SHA" \
  --calibration-report calibration-azure.json \
  --output-dir artifacts/adversarial-review
```

US-007 owns workflow orchestration. Publication must not begin until complete
deterministic continuous integration succeeds for the same head SHA.

## Fan-in

`Adversarial Review / fan-in` is a separate protected-base structural check.
It validates the enabled reviewer set, exact head, check and artifact
provenance, configuration fingerprints, digest shape, reviewer result, and
conclusion mapping. Missing, duplicate, stale, malformed, mismatched, failed,
or provenance-invalid evidence fails fan-in. Valid INCONCLUSIVE evidence keeps
fan-in neutral; it never authorizes an autonomous merge and never replaces an
individual reviewer check.
