#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  run-ralph-loop.sh --memory-dir <path> [--max-iterations <count>]
  run-ralph-loop.sh --memory-dir <path> --continuous

Options:
  --memory-dir      Issue memory directory under docs/memories.
  --max-iterations  Maximum fresh Copilot contexts. Defaults to 10.
  --continuous      Continue until completion or a safety stop.
  --dry-run         Validate inputs and print the Copilot command.
  --help            Show this help.
EOF
}

fail() {
  printf 'Ralph Loop error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' was not found."
}

MEMORY_DIR=""
MAX_ITERATIONS=10
CONTINUOUS=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --memory-dir)
      [[ $# -ge 2 ]] || fail "--memory-dir requires a value."
      MEMORY_DIR="$2"
      shift 2
      ;;
    --max-iterations)
      [[ $# -ge 2 ]] || fail "--max-iterations requires a value."
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --continuous)
      CONTINUOUS=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument '$1'."
      ;;
  esac
done

[[ -n "$MEMORY_DIR" ]] || fail "--memory-dir is required."
[[ "$MAX_ITERATIONS" =~ ^[1-9][0-9]*$ ]] ||
  fail "--max-iterations must be a positive integer."

require_command copilot
require_command gh
require_command git
require_command jq

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  fail "Run this script inside a Git repository."
cd "$REPO_ROOT"

case "$MEMORY_DIR" in
  docs/memories/*)
    ;;
  *)
    fail "--memory-dir must be under docs/memories/."
    ;;
esac

MEMORY_DIR="${MEMORY_DIR%/}"
PLAN_FILE="$MEMORY_DIR/plan.json"
ISSUE_FILE="$MEMORY_DIR/issue.md"
PROGRESS_FILE="$MEMORY_DIR/progress.md"
ITERATIONS_DIR="$MEMORY_DIR/iterations"
PROMPT_FILE="$REPO_ROOT/.github/skills/ralph-loop/references/iteration-prompt.md"

[[ -f "$PLAN_FILE" ]] || fail "Missing $PLAN_FILE."
[[ -f "$ISSUE_FILE" ]] || fail "Missing $ISSUE_FILE."
[[ -f "$PROGRESS_FILE" ]] || fail "Missing $PROGRESS_FILE."
[[ -f "$PROMPT_FILE" ]] || fail "Missing $PROMPT_FILE."
jq empty "$PLAN_FILE" >/dev/null || fail "$PLAN_FILE is not valid JSON."

ISSUE_NUMBER="$(jq -er '.issueNumber | numbers' "$PLAN_FILE")" ||
  fail "$PLAN_FILE must contain a numeric issueNumber."
ISSUE_TITLE="$(jq -er '.issueTitle | strings | select(length > 0)' "$PLAN_FILE")" ||
  fail "$PLAN_FILE must contain issueTitle."
BRANCH_NAME="$(jq -er '.branchName | strings | select(length > 0)' "$PLAN_FILE")" ||
  fail "$PLAN_FILE must contain branchName."
BASE_BRANCH="$(jq -er '.baseBranch | strings | select(length > 0)' "$PLAN_FILE")" ||
  fail "$PLAN_FILE must contain baseBranch."
jq -e '.stories | type == "array" and length > 0' "$PLAN_FILE" >/dev/null ||
  fail "$PLAN_FILE must contain at least one story."

CURRENT_BRANCH="$(git branch --show-current)"
[[ "$CURRENT_BRANCH" == "$BRANCH_NAME" ]] ||
  fail "Current branch '$CURRENT_BRANCH' does not match '$BRANCH_NAME'."
[[ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]] ||
  fail "The Ralph Loop cannot run on the base branch."
[[ -z "$(git status --porcelain)" ]] ||
  fail "The worktree must be clean before starting."

while IFS= read -r workspace_manifest; do
  workspace_dir="$(dirname "$workspace_manifest")"
  [[ -f "$workspace_dir/AGENTS.md" ]] ||
    fail "Workspace $workspace_dir is missing AGENTS.md."
done < <(find games packages -mindepth 2 -maxdepth 2 -name package.json -print | sort)

git remote get-url origin >/dev/null 2>&1 ||
  fail "The repository must have an origin remote."
gh repo view --json nameWithOwner >/dev/null 2>&1 ||
  fail "GitHub CLI cannot access the origin repository. Authenticate the correct account."

LOCK_DIR="$(git rev-parse --git-path ralph-loop.lock)"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "Another Ralph Loop appears to be running: $LOCK_DIR"
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

mkdir -p "$ITERATIONS_DIR"

COPILOT_COMMAND=(
  copilot
  -C "$REPO_ROOT"
  --prompt
  "Run one Ralph Loop iteration. MEMORY_DIR=$MEMORY_DIR. Read and follow .github/skills/ralph-loop/references/iteration-prompt.md."
  --allow-all-tools
  --allow-all-urls
  --no-ask-user
  --no-remote
  --no-remote-export
  --silent
  --stream off
)

if [[ "$DRY_RUN" == true ]]; then
  printf 'Validated Ralph Loop for issue #%s on branch %s.\n' \
    "$ISSUE_NUMBER" "$BRANCH_NAME"
  printf 'Command:'
  printf ' %q' "${COPILOT_COMMAND[@]}"
  printf '\n'
  exit 0
fi

printf 'Starting Ralph Loop for issue #%s: %s\n' "$ISSUE_NUMBER" "$ISSUE_TITLE"
printf 'Branch: %s\nMemory: %s\n' "$BRANCH_NAME" "$MEMORY_DIR"

iteration=1
while [[ "$CONTINUOUS" == true || "$iteration" -le "$MAX_ITERATIONS" ]]; do
  [[ -z "$(git status --porcelain)" ]] ||
    fail "Iteration $iteration cannot start with uncommitted changes."

  starting_commit="$(git rev-parse HEAD)"
  log_file="$ITERATIONS_DIR/$(printf '%04d' "$iteration").log"
  printf '\n=== Ralph iteration %d ===\n' "$iteration"

  set +e
  "${COPILOT_COMMAND[@]}" 2>&1 | tee "$log_file"
  copilot_status=${PIPESTATUS[0]}
  set -e

  if [[ "$copilot_status" -ne 0 ]]; then
    fail "Copilot exited with status $copilot_status. See $log_file."
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Iteration $iteration left uncommitted changes. Inspect the worktree and $log_file."
  fi

  ending_commit="$(git rev-parse HEAD)"
  reported_complete=false
  if grep -q '<promise>COMPLETE</promise>' "$log_file"; then
    reported_complete=true
  fi

  if [[ "$starting_commit" == "$ending_commit" && "$reported_complete" == false ]]; then
    fail "Iteration $iteration made no commit and did not report completion."
  fi

  git push --set-upstream origin "$BRANCH_NAME"

  if ! gh pr view "$BRANCH_NAME" --json url >/dev/null 2>&1; then
    gh pr create \
      --draft \
      --base "$BASE_BRANCH" \
      --head "$BRANCH_NAME" \
      --title "$ISSUE_TITLE" \
      --body "Tracks #$ISSUE_NUMBER.

This draft pull request is maintained by the local Ralph Loop. A human must review and merge it."
  fi

  pr_url="$(gh pr view "$BRANCH_NAME" --json url --jq '.url')"
  printf 'Draft pull request: %s\n' "$pr_url"

  if [[ "$reported_complete" == true ]]; then
    if ! jq -e 'all(.stories[]; .passes == true)' "$PLAN_FILE" >/dev/null; then
      printf 'Completion was reported, but unfinished stories remain. Continuing.\n'
      iteration=$((iteration + 1))
      continue
    fi

    if gh pr checks "$BRANCH_NAME" >/dev/null; then
      printf 'Ralph Loop completed issue #%s with passing reported checks.\n' \
        "$ISSUE_NUMBER"
      exit 0
    fi

    printf 'Completion was reported, but pull request checks are not green. Continuing.\n'
  fi

  iteration=$((iteration + 1))
done

printf 'Ralph Loop reached %s iterations before completion.\n' "$MAX_ITERATIONS" >&2
exit 2
