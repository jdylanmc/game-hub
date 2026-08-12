# Adversarial review context collector

`scripts/collect-adversarial-context.ts` creates the deterministic evidence
packet consumed by later adversarial-review stories. It reads Git objects only;
it never checks out, imports, installs, builds, tests, or executes pull-request
content.
Local and system Git configuration, hooks, external diffs, text conversion, and
pathspec interpretation are disabled. Blobs are addressed by object ID rather
than interpolating untrusted paths into revision expressions.

## Trust boundary

All issue text, pull-request metadata, diffs, and repository blobs are labeled
untrusted data. Embedded instructions are preserved verbatim as evidence but
have no authority. The collector invokes `git` directly with argument arrays,
disables external diff and text-conversion hooks, and never invokes a shell for
repository content.

## Input

Provide a local JSON file:

```json
{
  "issue": {
    "number": 30,
    "url": "https://github.com/jdylanmc/game-hub/issues/30",
    "title": "Adversarial Agent Review of Unit Tests",
    "body": "Issue body",
    "acceptanceCriteria": ["Criterion"]
  },
  "pullRequest": {
    "number": 35,
    "url": "https://github.com/jdylanmc/game-hub/pull/35",
    "repository": "jdylanmc/game-hub",
    "title": "Pull request title",
    "body": "Pull request body",
    "author": "author",
    "baseSha": "40-character commit SHA",
    "headSha": "40-character commit SHA",
    "baseRef": "main",
    "headRef": "feature",
    "isFork": false
  }
}
```

Both commits must already exist in the local Git object database. Collection
does not fetch network content.

```bash
yarn context:collect --input review-input.json --output review-context.json
```

The same input commits and versioned configuration produce byte-identical JSON.
Attribution includes the exact base/head commits plus canonical input and
configuration SHA-256 hashes.

## Evidence and limits

`config/adversarial-agents/context-collector.json` versions:

- total evidence, metadata, file, patch, and diff-context limits;
- a hard two-megabyte serialized packet limit and a 768 KiB evidence budget,
  sized to remain below the reviewed model token and cost ceilings;
- mandatory contracts, manifests, generators, workflows, validation
  configuration, and existing-test patterns;
- production and test classification, including repository tooling under
  `scripts/` as production behavior.

Text diffs include parsed hunks with old and new line numbers. Repository files
include their path and included line range. Renames, deletions, binary content,
original byte counts, included byte counts, and truncation are explicit.

Mandatory missing, binary, file-limited, or truncated evidence sets packet
status to `BLOCKED`, records stable machine-readable reasons, and makes the
command exit `3`. Invalid input or unavailable commits exit `1`. A ready packet
exits `0`.

The packet is only context. Model invocation, prompt construction, network
access, and enforcement belong to US-004 and later stories.
