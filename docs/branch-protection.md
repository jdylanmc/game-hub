# Branch Protection

The `main` branch is protected through the GitHub branch protection API. The
repository requires these controls before a pull request can merge:

- the GitHub Actions `Continuous integration` check from app ID `15368`;
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

Use the repository-owner GitHub CLI account and inspect the protected branch:

```bash
gh auth switch --hostname github.com --user jdylanmc
gh api repos/jdylanmc/game-hub/branches/main/protection
```

The response must report strict required status checks, the
`Continuous integration` check bound to app ID `15368`, administrator
enforcement, one required Code Owner review, stale-review dismissal, last-push
approval, conversation resolution, linear history, and disabled force pushes
and deletion.

The protection is a GitHub repository setting and requires no Azure
infrastructure.
