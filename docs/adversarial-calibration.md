# Adversarial reviewer calibration

US-005 adds an evaluation and promotion gate; it does not promote, publish, or
require a GitHub check.

## Benchmark corpus

`config/adversarial-agents/benchmarks.json` contains 18 versioned cases: one
intentionally weak and one strong example for each required scenario:

- tautology;
- mocked-away or ineffective behavior;
- missing error path;
- race condition;
- duplicate score submission;
- collision boundary;
- ZIP/archive traversal;
- authorization bypass;
- cleanup leak.

Each case is inert evidence. The evaluation passes it through the same bounded
reviewer engine used by later real runs.

## Evaluation

Run the deterministic fake-transport evaluation:

```bash
yarn calibrate:adversarial --mode fixture --output calibration-fixture.json
```

Fixture reports exercise the complete engine and metrics pipeline but are
explicitly uncalibrated and can never promote the check.

After US-009 deploys Azure and configures Microsoft Entra ID, run the same
tooling without embedding credentials:

```bash
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com \
AZURE_OPENAI_DEPLOYMENT_ID=game-hub-unit-test-reviewer \
yarn calibrate:adversarial --mode azure --repetitions 2 \
  --output calibration-azure.json
```

The report records:

- blocking-pattern detection and true positives;
- false positives on strong/advisory cases;
- missed critical scenarios;
- repeated-review agreement;
- token usage and estimated cost;
- latency and error rate;
- exact case evidence and a tamper-evident report hash.

The report hash detects byte changes but does not prove signer provenance.
Gilfoyle additionally requires the protected-run GitHub artifact attestation
documented in
[Adversarial calibration attestation](adversarial-calibration-attestation.md).
A repository-authored JSON claim, fixture report, feature-branch run, or
unsigned Azure report cannot promote the reviewer.

## Promotion policy

`config/adversarial-agents/promotion-policy.json` requires:

- a complete real-Azure run over all 18 cases with at least two repetitions;
- 100% blocking-pattern detection;
- at most 5% strong-example false positives;
- zero missed critical scenarios and reviewer errors;
- at least 95% reviewer agreement;
- at most $0.10 average estimated cost and 60-second p95 latency.

Check a retained report:

```bash
yarn calibration:check --report calibration-azure.json
```

The command exits `0` only when every threshold and integrity check passes.
Fixture, stale, incomplete, threshold-failing, internally inconsistent, or
tampered reports exit `3`.

Calibration is invalidated when any reviewed model deployment/version, prompt
version/hash, tools version, test framework, finding schema version/hash,
verdict policy version/hash, system policy, reviewer engine configuration,
benchmark corpus, or architecture fingerprint changes. Re-run calibration
before any later story can make the model-backed check required.

## Protected Gilfoyle calibration

Gilfoyle uses its independent 24-case corpus and promotion policy:

- 11 vulnerable cases and 11 paired safe cases cover authorization bypass,
  injection, secret exposure, workflow escalation, dependency risk, Bicep
  privilege, archive traversal, unsafe deserialization, race conditions,
  cleanup leaks, and prompt-injection control bypass;
- two medium advisory cases prove that a real weakness without a control bypass
  does not become a blocking verdict;
- every vulnerable case must block, safe false positives may not exceed 5%,
  advisory escalation and missed critical/control-bypass cases must be zero,
  agreement must be at least 95%, errors must be zero, average cost must remain
  at most $0.10, total calibration cost at most $0.25, and p95 latency at most
  60 seconds; and
- calibration is sequential with a reviewed per-request cost ceiling.

Run the deterministic path locally:

```bash
yarn calibrate:adversarial --mode fixture \
  --agent gilfoyle-security-architect \
  --repetitions 2 \
  --output test-results/gilfoyle-calibration-fixture.json
```

Only `.github/workflows/adversarial-calibration.yml` may perform the real Azure
run. It uses the protected `adversarial-review` environment, Microsoft Entra ID
OpenID Connect, subscription `11213dbd-39fe-46ba-87db-5f5e8c449aed`, and the
dedicated versioned deployment. The workflow checks strict thresholds before
creating and verifying the same-run GitHub artifact attestation. It is manually
dispatched from protected `main`; fixture mode and feature-branch runs remain
non-promotable.

Model-backed evaluation remains downstream of complete deterministic
continuous integration. No workflow invokes it in US-005.
