# Adversarial reviewer calibration

> A shared schema, policy, engine, critic, or presentation-contract change
> invalidates the active calibration fingerprint. Run a complete real Azure
> calibration and replace the report through the protected attestation path;
> fixture output is never promotion evidence.

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

Gilfoyle is registered disabled with a separate prompt, schema, policy, bounded
tools contract, engine configuration, 24-case corpus, and strict promotion
policy. The corpus contains vulnerable and safe pairs for the required security
scenarios plus medium advisory controls. Fixture mode exercises these rules but
remains non-promotable.

Only `.github/workflows/adversarial-calibration.yml` may create trusted
calibration evidence. It is manually dispatched from protected `main`, uses the
`adversarial-review` environment and Microsoft Entra ID/OpenID Connect, checks
the dedicated deployment identity, enforces thresholds before signing, and
verifies the same-run attestation. This prerequisite installs that inert
capability only; it does not enable Gilfoyle or publish a pull-request check.

Model-backed evaluation remains downstream of complete deterministic
continuous integration. No workflow invokes it in US-005.
