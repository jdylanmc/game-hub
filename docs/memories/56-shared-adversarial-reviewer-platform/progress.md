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
