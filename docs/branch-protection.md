# Branch Protection

The `main` branch is protected through the GitHub branch protection API. The
repository requires these controls before a pull request can merge:

- the GitHub Actions `Continuous integration` check from app ID `15368`;
- the exact-head `Adversarial Review / unit-test-reviewer` check, which runs
  only after deterministic continuous integration succeeds;
- a branch that is current with `main` before the required check can satisfy
  protection;
- one approving review, including Code Owner review for workflow changes;
- dismissal of stale reviews and approval by someone other than the last
  pusher;
- resolved review conversations and linear history;
- enforcement for administrators; and
- no force pushes or branch deletion.

`/.github/CODEOWNERS` owns the workflow directory and the ownership file itself.
`yarn policy:check` fails if either ownership rule is missing, so a pull request
cannot remove heightened workflow review while retaining a successful required
check.

## Verify the live configuration

Resolve the repository-owner GitHub CLI token without changing shared account
state, then inspect the protected branch:

```bash
GH_TOKEN="$(GH_TOKEN= GITHUB_TOKEN= gh auth token \
  --hostname github.com --user jdylanmc)"
GH_TOKEN="$GH_TOKEN" gh api repos/jdylanmc/game-hub/branches/main/protection
```

The response must report strict required status checks, the
`Continuous integration` check bound to app ID `15368`, the adversarial review
check, administrator enforcement, conversation resolution, linear history, and
disabled force pushes and deletion. Repository rules and Code Ownership provide
the applicable human review requirements.

The protection is a GitHub repository setting and requires no Azure
infrastructure.

## Additive reviewer promotion

`yarn promotion:branch-protection <reviewed-input.json>` is an audited,
process-local `GH_TOKEN` compare-and-swap tool for software-factory. It reads
the owner identity and live protection, requires the committed expected old
protection and promotion manifests, verifies an exact-head PASS proof and
retained evidence digests, then adds exactly one reviewer check. Removal,
rename, duplicate requirements, INCONCLUSIVE proof, waiver use, stale proof,
or drift stops the transaction. If convergence fails after an update,
automation freezes and forward-fixes the stronger state; it never rolls
protection back.

The current bootstrap configuration does **not** add fan-in to live branch
protection. A later human-reviewed proof pull request uses the same command
after protected `main` has published fan-in on an exact head.
