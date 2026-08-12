# Adversarial calibration attestation

Gilfoyle calibration reports are not promotion evidence by themselves. A
repository-authored JSON document can claim `runMode: "azure"` and recompute an
unkeyed report hash. Promotion must additionally verify a GitHub artifact
attestation created by the trusted calibration workflow.

This prerequisite installs the predicate builder, verifier, protected workflow,
policy, deterministic tests, and disabled calibration configuration on
protected `main`. It does not run calibration, retain a report, enable the
reviewer, publish a pull-request check, or promote Gilfoyle. A later issue #22
change may propose promotion only after a fresh protected run meets every
threshold and verifies its same-run attestation.

## Trust model

`calibration-attestation-policy.json` pins all non-user-controlled trust:

- repository owner and repository numeric IDs;
- protected `refs/heads/main`;
- the exact calibration workflow path and GitHub-hosted runner;
- the GitHub OpenID Connect issuer and immutable protected-environment workload
  subject;
- the reviewed `actions/attest` commit;
- the Azure subscription, resource ID, endpoint, deployment, model, version,
  stock keeping unit, region, and credential scope; and
- maximum workflow duration, clock skew, and attestation age.

The trusted workflow must run from protected `main` in the
`adversarial-review` environment. Pull-request workflows, feature branches,
self-hosted runners, arbitrary reusable-workflow callers, and uploaded
predicates are not trusted builders.

The custom predicate binds the exact repository head and workflow commit,
workflow run and attempt, registered agent/configuration fingerprints, Azure
tenant and client identifiers, immutable workload subject, benchmark corpus and
case-ID digests, report file and internal digests, uploaded artifact ID and
digest, and normalized timestamps. Its replay nonce covers the same exact run,
artifact, report, and configuration.

## Protected workflow sequence

The protected calibration workflow is inert until manually dispatched. When
dispatched, it implements this order without accepting report or predicate
content from workflow inputs:

1. Start only through `workflow_dispatch` on protected `main`, enter the
   `adversarial-review` environment, and record the workflow start time.
2. Check out and install only the exact protected workflow commit.
3. Authenticate to Azure through OpenID Connect. Do not use model keys, client
   secrets, access-token files, or echoed tokens.
4. Generate and threshold-check the Gilfoyle report in that job.
5. Upload the report with immutable `actions/upload-artifact` and retain its
   artifact ID and SHA-256 digest.
6. Run `yarn calibration:attestation:create` with the protected GitHub context,
   Azure public identifiers, report path, and upload outputs.
7. Run `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6`
   (`v4.2.2`) with the report as `subject-path`, the policy predicate type, and
   the generated predicate path.
8. Run `yarn calibration:attestation:verify` against the returned bundle in the
   same run and attempt. The workflow never writes a promotion file.

The attestation job needs only `contents: read`, `id-token: write`, and
`attestations: write`. The attestation bundle and calibration report are
retained evidence; neither contains credentials or raw tokens.

## Verification

The verifier invokes `gh attestation verify` directly, without a shell, and
requires:

- the GitHub Sigstore trust root rather than the public-good instance;
- the exact signer workflow, signer digest, source ref, source digest, and
  GitHub OpenID Connect issuer;
- a GitHub-hosted runner and the custom predicate type;
- exactly one verified attestation and one report subject;
- the certificate's immutable repository IDs, signer identity, protected head,
  workflow trigger, and run-invocation URI;
- an exact predicate match to the current run context and repository files; and
- a verified transparency-log or timestamp-authority time within 30 minutes.

Cryptographic failure, missing or duplicate attestations, another run or
attempt, a stale or future timestamp, changed repository/configuration/Azure
identity, a different benchmark or artifact, or modified report bytes all fail
closed. Reusing an older valid bundle fails because its certificate-bound run
invocation cannot equal the current protected run and attempt.

Run the deterministic implementation checks with:

```bash
yarn policy:calibration-attestation
yarn vitest run scripts/calibration-attestation.test.mjs \
  scripts/check-calibration-attestation-policy.test.mjs
```

`gh` 2.92.0 or newer is required. Trust-root, transparency-log, GitHub API, or
attestation service outages are blocking; operators must retry a new protected
run rather than bypass verification.

## Promotion remains blocked

The Gilfoyle promotion policy remains `calibration-required` with
`promotionAllowed: false` until a complete protected run passes thresholds and
same-run verification. The trust policy intentionally requires
`refs/heads/main`; a feature branch cannot self-attest or self-promote its own
workflow and configuration. A signed report that misses thresholds is still
not promotable, and a threshold-passing unsigned or non-main report is also not
promotable. Enabling the reviewer, registering a required check, changing branch
protection, retaining an active calibration report, and promoting fixture
evidence are outside this prerequisite.
