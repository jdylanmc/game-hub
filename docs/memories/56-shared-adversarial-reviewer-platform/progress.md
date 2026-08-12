# Progress

## Codebase Patterns

- The privileged adversarial workflow always executes protected `main` code
  after exact-head deterministic Continuous Integration and never checks out or
  executes pull-request-controlled content.
- Reviewer configuration is registry-backed and fingerprinted; shared platform
  changes must preserve independent role configuration and calibration.
- GitHub checks are exact-head retained evidence, while branch protection and
  Ralph completion consume the versioned required-check configuration.

## Iterations

### US-001 — Migrate the authoritative reviewer result contract

- **Confirmed seam:** `AdversarialFindingValidator` and the
  `validate-adversarial-finding.ts` command.
- **Red:** `yarn vitest run scripts/validate-adversarial-finding.test.mjs
  --coverage.enabled=false` failed because schema `1.0.0` rejected the shared
  PASS, FAIL, platform-FAIL, and compute-only INCONCLUSIVE evidence.
- **Green:** The same command passed after adding the versioned `2.0.0`
  contract validator. It requires provenance, digests, fingerprinted
  attribution, remediation and verification guidance, and applies critic
  CONFIRM/REJECT/INCONCLUSIVE severity semantics.
- **Broader checks:** `yarn vitest run
  scripts/validate-adversarial-finding.test.mjs
  scripts/validate-adversarial-agent-registry.test.mjs
  --coverage.enabled=false`; `yarn agents:validate`.

### US-002 — Add bounded compute outage, critic, and persona execution

- **Confirmed seam:** `review-adversarial-context.ts` with injected model
  transports, clocks, critic result, and persona renderer.
- **Red:** `yarn vitest run scripts/review-adversarial-context.test.mjs
  --coverage.enabled=false` showed that exhausted retryable compute returned
  the retired `ERROR` decision rather than compute-only INCONCLUSIVE.
- **Green:** Retryable compute makes exactly three attempts with bounded
  exponential backoff and then returns INCONCLUSIVE. Other failures return a
  platform FAIL. Proposed blockers alone receive a critic pass; CONFIRM,
  REJECT, and calibrated-high-confidence INCONCLUSIVE produce the required
  severities. Persona failures produce a neutral validated presentation.
- **Broader checks:** `yarn vitest run
  scripts/review-adversarial-context.test.mjs
  scripts/validate-adversarial-finding.test.mjs
  --coverage.enabled=false`; `yarn typecheck`; `yarn agents:validate`.

### US-003 — Introduce enabled and promoted reviewer orchestration

- **Confirmed seams:** `agents:validate`, the reviewer-matrix resolver, and
  the protected-base workflow policy command.
- **Red:** The registry-state test failed because a reviewer could be promoted
  without an explicit state, including while disabled.
- **Green:** Each registration now records `enabled` and `promoted`; promotion
  requires enablement. The protected-base workflow obtains its primary matrix,
  agent identity, deployment, and calibration report from the validated
  registry while retaining protected `main` checkout and no pull-request
  execution.
- **Broader checks:** `yarn vitest run
  scripts/check-adversarial-workflow-policy.test.mjs
  scripts/validate-adversarial-agent-registry.test.mjs
  scripts/resolve-adversarial-reviewer-matrix.test.mjs
  --coverage.enabled=false`; `yarn policy:adversarial-workflow`; `yarn
  agents:validate`; `yarn typecheck`.

### US-004 — Publish independent checks and deterministic fan-in

- **Confirmed seams:** `publishAdversarialEvidence` and
  `evaluateAdversarialFanIn` with injected check/evidence records.
- **Red:** The fan-in test could not import an implementation, so no
  independently attributable exact-head evidence was structurally evaluated.
- **Green:** Publisher conclusions now map PASS to success, confirmed or
  platform FAIL to failure, and compute-only INCONCLUSIVE to neutral. Fan-in
  rejects missing, duplicate, stale, mismatched, failed, or provenance-invalid
  evidence and keeps valid INCONCLUSIVE evidence neutral. The protected-base
  workflow adds a separately published `Adversarial Review / fan-in` check.
- **Broader checks:** `yarn vitest run
  scripts/publish-adversarial-evidence.test.mjs
  scripts/fan-in-adversarial-evidence.test.mjs
  --coverage.enabled=false`; `yarn typecheck`.

### US-005 — Validate exact-head outage waivers

- **Confirmed seam:** `validateAdversarialWaiver` over supplied pull-request
  comment metadata.
- **Red:** The waiver test could not import a validator, so no machine-readable
  comment could bind an outage to the exact head.
- **Green:** A waiver requires exactly one unedited comment from an authorized
  owner, one repository/pull-request/reviewer/head binding, outage evidence,
  rationale, authorizer, canonical chronology, and an unexpired maximum
  24-hour lifetime. It only accepts compute-only INCONCLUSIVE results and
  refuses promotion use.
- **Broader checks:** `yarn vitest run
  scripts/validate-adversarial-waiver.test.mjs --coverage.enabled=false`.

### US-006 — Add monotonic branch-protection promotion

- **Confirmed seam:** `promoteAdversarialBranchProtection` with an injected
  GitHub branch-protection transport.
- **Red:** The promotion test could not import a compare-and-swap
  implementation.
- **Green:** The owner-authenticated process-local command verifies the exact
  old live state, an additive one-check/one-reviewer transition, exact-head
  PASS proof and evidence digests, performs one update, and verifies
  convergence without rollback. It rejects authentication failure, drift,
  removal, rename, duplication, stale or neutral proof, and manifest drift.
- **Broader checks:** `yarn vitest run
  scripts/promote-adversarial-branch-protection.test.mjs
  --coverage.enabled=false`.

### US-007 — Integrate fail-closed policy and documentation

- **Confirmed seams:** repository policy commands and the public package
  commands for fan-in, waiver validation, and promotion.
- **Integration:** Added policy assertions for the shared versioned contract,
  registry matrix, fan-in workflow, and canonical commands. Documentation now
  covers critic capacity, conclusion mapping, fan-in, waivers, bootstrap
  sequencing, and forward-only protection repair.
- **Checks:** `yarn format:check`, `yarn lint`, `yarn typecheck`, targeted
  adversarial tests (93 tests), `yarn policy:adversarial-workflow`, and
  `yarn policy:adversarial` pass.
- **Blocker:** Full `yarn policy:check` correctly fails only because the
  active real-Azure calibration fingerprint is stale after this intentionally
  fingerprinted schema/policy/engine migration. Replacing it requires a
  complete real-Azure calibration and protected-run attestation; a fixture or
  rewritten report would violate the fail-closed calibration policy.
