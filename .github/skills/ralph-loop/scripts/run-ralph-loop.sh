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

validate_plan() {
  jq -e '
    type == "object" and
    (.repoNameWithOwner | type == "string" and length > 0) and
    (.issueNumber | type == "number" and . > 0 and floor == .) and
    (.issueTitle | type == "string" and length > 0) and
    (.issueUrl | type == "string" and length > 0) and
    (.branchName | type == "string" and length > 0) and
    (.baseBranch | type == "string" and length > 0) and
    (.continuousByBestJudgment | type == "boolean") and
    ((.orchestration // {}) |
      type == "object" and
      ((.priority // 100) | type == "number") and
      ((.dependencies // []) |
        type == "array" and
        all(.[]; type == "number" and . > 0 and floor == .)) and
      ((.changeScopes // ["."]) |
        type == "array" and
        length > 0 and
        all(.[]; type == "string" and length > 0))) and
    (.stories |
      type == "array" and
      length > 0 and
      all(.[];
        (.id | type == "string" and length > 0) and
        (.title | type == "string" and length > 0) and
        (.description | type == "string" and length > 0) and
        (.acceptanceCriteria |
          type == "array" and
          length > 0 and
          all(.[]; type == "string" and length > 0)) and
        (.priority | type == "number") and
        (.passes | type == "boolean") and
        (.notes | type == "string") and
        ((.dependencies // []) |
          type == "array" and
          all(.[]; type == "string" and length > 0))) and
      ([.[].id] | length == (unique | length)))
  ' "$PLAN_FILE" >/dev/null ||
    fail "$PLAN_FILE does not match the required Ralph plan schema."
}

assert_plan_identity() {
  [[ "$(jq -r '.repoNameWithOwner' "$PLAN_FILE")" == "$REPO_NAME_WITH_OWNER" ]] ||
    fail "The plan repository identity changed during the run."
  [[ "$(jq -r '.issueNumber' "$PLAN_FILE")" == "$ISSUE_NUMBER" ]] ||
    fail "The plan issue identity changed during the run."
  [[ "$(jq -r '.branchName' "$PLAN_FILE")" == "$BRANCH_NAME" ]] ||
    fail "The plan branch identity changed during the run."
  [[ "$(jq -r '.baseBranch' "$PLAN_FILE")" == "$BASE_BRANCH" ]] ||
    fail "The plan base branch changed during the run."
}

remote_name_from_url() {
  local remote_url="$1"
  local remote_name=""

  case "$remote_url" in
    git@github.com:*)
      remote_name="${remote_url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      remote_name="${remote_url#ssh://git@github.com/}"
      ;;
    https://github.com/*)
      remote_name="${remote_url#https://github.com/}"
      ;;
    *)
      return 1
      ;;
  esac

  printf '%s\n' "${remote_name%.git}"
}

remote_branch_exists() {
  git ls-remote --exit-code --heads origin "refs/heads/$BRANCH_NAME" \
    >/dev/null 2>&1
}

fetch_and_verify_remote_state() {
  git fetch --quiet origin \
    "$BASE_BRANCH:refs/remotes/origin/$BASE_BRANCH" ||
    fail "Could not fetch origin/$BASE_BRANCH."

  if remote_branch_exists; then
    git fetch --quiet origin \
      "$BRANCH_NAME:refs/remotes/origin/$BRANCH_NAME" ||
      fail "Could not fetch origin/$BRANCH_NAME."

    git merge-base --is-ancestor "origin/$BRANCH_NAME" HEAD ||
      fail "The local branch is behind or diverged from origin/$BRANCH_NAME. Reconcile it manually."
  fi
}

load_pull_request() {
  local pr_list
  local pr_count

  pr_list="$(gh pr list \
    --repo "$REPO_NAME_WITH_OWNER" \
    --head "$BRANCH_NAME" \
    --state all \
    --json number,url,body,state,isDraft,headRefName,baseRefName)" ||
    fail "Could not query pull requests for $BRANCH_NAME."

  pr_count="$(jq 'length' <<<"$pr_list")"
  [[ "$pr_count" -le 1 ]] ||
    fail "Multiple pull requests use branch $BRANCH_NAME."

  if [[ "$pr_count" -eq 0 ]]; then
    PR_JSON=""
    PR_NUMBER=""
    PR_URL=""
    return
  fi

  PR_JSON="$(jq '.[0]' <<<"$pr_list")"
  PR_NUMBER="$(jq -r '.number' <<<"$PR_JSON")"
  PR_URL="$(jq -r '.url' <<<"$PR_JSON")"

  [[ "$(jq -r '.state' <<<"$PR_JSON")" == "OPEN" ]] ||
    fail "Pull request #$PR_NUMBER is not open."
  [[ "$(jq -r '.isDraft' <<<"$PR_JSON")" == "true" ]] ||
    fail "Pull request #$PR_NUMBER is not a draft. A human must decide how to proceed."
  [[ "$(jq -r '.headRefName' <<<"$PR_JSON")" == "$BRANCH_NAME" ]] ||
    fail "Pull request #$PR_NUMBER uses an unexpected head branch."
  [[ "$(jq -r '.baseRefName' <<<"$PR_JSON")" == "$BASE_BRANCH" ]] ||
    fail "Pull request #$PR_NUMBER uses an unexpected base branch."

  local pr_body
  pr_body="$(jq -r '.body // ""' <<<"$PR_JSON")"
  if [[ "$pr_body" != *"<!-- ralph-issue:$ISSUE_NUMBER -->"* &&
        "$pr_body" != *"Tracks #$ISSUE_NUMBER."* ]]; then
    fail "Pull request #$PR_NUMBER is not bound to issue #$ISSUE_NUMBER."
  fi
}

create_pull_request() {
  local create_output

  if ! create_output="$(gh pr create \
    --repo "$REPO_NAME_WITH_OWNER" \
    --draft \
    --base "$BASE_BRANCH" \
    --head "$BRANCH_NAME" \
    --title "$ISSUE_TITLE" \
    --body "<!-- ralph-issue:$ISSUE_NUMBER -->

Tracks #$ISSUE_NUMBER.

This draft pull request is maintained by the local Ralph Loop. A human must review and merge it.")"; then
    fail "The branch was pushed, but draft pull request creation failed. Rerun to reconcile the partial publication."
  fi

  printf '%s\n' "$create_output"
  load_pull_request
  [[ -n "$PR_NUMBER" ]] ||
    fail "Draft pull request creation returned without a discoverable pull request."
}

check_pull_request_gates() {
  local checks_output
  local checks_status

  set +e
  checks_output="$(gh pr checks "$PR_NUMBER" \
    --repo "$REPO_NAME_WITH_OWNER" \
    --watch \
    --fail-fast \
    --interval 10 2>&1)"
  checks_status=$?
  set -e

  if [[ "$checks_status" -eq 0 ]]; then
    return 0
  fi

  if [[ "$checks_output" == *"no checks reported"* ||
        "$checks_output" == *"no checks"* ]]; then
    fail "Pull request #$PR_NUMBER has no reported CI checks. Completion requires configured gates."
  fi

  printf '%s\n' "$checks_output" >&2
  return 1
}

cleanup() {
  local status=$?
  trap - EXIT

  local lock_dir
  for lock_dir in "${LOCK_DIRS[@]}"; do
    rm -f "$lock_dir/pid" "$lock_dir/host" "$lock_dir/started-at" "$lock_dir/identity"
    rmdir "$lock_dir" 2>/dev/null || true
  done

  exit "$status"
}

acquire_lock() {
  local lock_name="$1"
  local lock_identity="$2"
  local lock_dir="$LOCK_ROOT/$lock_name.lock"
  local lock_host=""
  local lock_pid=""
  local current_host
  current_host="$(hostname)"

  if ! mkdir "$lock_dir" 2>/dev/null; then
    lock_host="$(cat "$lock_dir/host" 2>/dev/null || true)"
    lock_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"

    if [[ "$lock_host" == "$current_host" &&
          "$lock_pid" =~ ^[1-9][0-9]*$ ]] &&
        ! kill -0 "$lock_pid" 2>/dev/null; then
      rm -f \
        "$lock_dir/pid" \
        "$lock_dir/host" \
        "$lock_dir/started-at" \
        "$lock_dir/identity"
      rmdir "$lock_dir" 2>/dev/null ||
        fail "A stale Ralph lock could not be removed: $lock_dir"
      mkdir "$lock_dir" ||
        fail "Could not acquire $lock_identity after removing stale state."
    else
      fail "Another Ralph Loop owns $lock_identity (host=${lock_host:-unknown}, pid=${lock_pid:-unknown})."
    fi
  fi

  LOCK_DIRS+=("$lock_dir")
  printf '%s\n' "$$" > "$lock_dir/pid"
  hostname > "$lock_dir/host"
  date -Iseconds > "$lock_dir/started-at"
  printf '%s\n' "$lock_identity" > "$lock_dir/identity"
}

MEMORY_DIR=""
MAX_ITERATIONS=10
CONTINUOUS=false
DRY_RUN=false
LOCK_DIRS=()
PR_JSON=""
PR_NUMBER=""
PR_URL=""

trap cleanup EXIT

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

[[ "$MEMORY_DIR" != /* ]] ||
  fail "--memory-dir must be repository-relative."
case "/$MEMORY_DIR/" in
  */../*|*/./*)
    fail "--memory-dir cannot contain dot path components."
    ;;
esac
case "$MEMORY_DIR" in
  docs/memories/*)
    ;;
  *)
    fail "--memory-dir must be under docs/memories/."
    ;;
esac

MEMORY_DIR="${MEMORY_DIR%/}"
[[ -d "$MEMORY_DIR" ]] || fail "Missing memory directory $MEMORY_DIR."
MEMORY_DIR_ABS="$(cd "$MEMORY_DIR" && pwd -P)"
case "$MEMORY_DIR_ABS/" in
  "$REPO_ROOT/docs/memories/"*)
    ;;
  *)
    fail "The memory directory resolves outside docs/memories/."
    ;;
esac
MEMORY_DIR="${MEMORY_DIR_ABS#"$REPO_ROOT/"}"

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
validate_plan

REPO_NAME_WITH_OWNER="$(jq -r '.repoNameWithOwner' "$PLAN_FILE")"
ISSUE_NUMBER="$(jq -r '.issueNumber' "$PLAN_FILE")"
ISSUE_TITLE="$(jq -r '.issueTitle' "$PLAN_FILE")"
ISSUE_URL="$(jq -r '.issueUrl' "$PLAN_FILE")"
BRANCH_NAME="$(jq -r '.branchName' "$PLAN_FILE")"
BASE_BRANCH="$(jq -r '.baseBranch' "$PLAN_FILE")"
REPO_OWNER="${REPO_NAME_WITH_OWNER%%/*}"

if [[ "$CONTINUOUS" == true &&
      "$(jq -r '.continuousByBestJudgment' "$PLAN_FILE")" != "true" ]]; then
  fail "Continuous mode requires explicit delegation recorded in plan.json."
fi

ORIGIN_URL="$(git remote get-url origin 2>/dev/null)" ||
  fail "The repository must have an origin remote."
ORIGIN_NAME_WITH_OWNER="$(remote_name_from_url "$ORIGIN_URL")" ||
  fail "The origin remote must be a supported GitHub SSH or HTTPS URL."
[[ "$ORIGIN_NAME_WITH_OWNER" == "$REPO_NAME_WITH_OWNER" ]] ||
  fail "Origin targets $ORIGIN_NAME_WITH_OWNER, but the plan targets $REPO_NAME_WITH_OWNER."

if [[ -z "${GH_TOKEN:-}" ]]; then
  OWNER_GH_TOKEN="$(GH_TOKEN= GITHUB_TOKEN= gh auth token \
    --hostname github.com \
    --user "$REPO_OWNER" 2>/dev/null)" ||
    fail "GitHub CLI has no stored credential for $REPO_OWNER."
  [[ -n "$OWNER_GH_TOKEN" ]] ||
    fail "GitHub CLI returned an empty credential for $REPO_OWNER."
  export GH_TOKEN="$OWNER_GH_TOKEN"
  unset OWNER_GH_TOKEN
fi

ACTIVE_GH_ACCOUNT="$(gh api user --jq '.login' 2>/dev/null)" ||
  fail "Could not verify the isolated GitHub CLI credential."
[[ "$ACTIVE_GH_ACCOUNT" == "$REPO_OWNER" ]] ||
  fail "Isolated GitHub credential belongs to $ACTIVE_GH_ACCOUNT, not $REPO_OWNER."

ACTUAL_REPO="$(gh repo view "$REPO_NAME_WITH_OWNER" \
  --json nameWithOwner \
  --jq '.nameWithOwner')" ||
  fail "GitHub CLI cannot access $REPO_NAME_WITH_OWNER."
[[ "$ACTUAL_REPO" == "$REPO_NAME_WITH_OWNER" ]] ||
  fail "GitHub resolved an unexpected repository: $ACTUAL_REPO."

REMOTE_DEFAULT_BRANCH="$(gh repo view "$REPO_NAME_WITH_OWNER" \
  --json defaultBranchRef \
  --jq '.defaultBranchRef.name')" ||
  fail "Could not resolve the repository default branch."
[[ "$REMOTE_DEFAULT_BRANCH" == "$BASE_BRANCH" ]] ||
  fail "The plan base branch $BASE_BRANCH is not the repository default branch $REMOTE_DEFAULT_BRANCH."

LIVE_ISSUE="$(gh issue view "$ISSUE_NUMBER" \
  --repo "$REPO_NAME_WITH_OWNER" \
  --json number,title,url,state)" ||
  fail "Could not read issue #$ISSUE_NUMBER from $REPO_NAME_WITH_OWNER."
[[ "$(jq -r '.number' <<<"$LIVE_ISSUE")" == "$ISSUE_NUMBER" ]] ||
  fail "GitHub returned an unexpected issue number."
[[ "$(jq -r '.url' <<<"$LIVE_ISSUE")" == "$ISSUE_URL" ]] ||
  fail "The plan issue URL does not match the live GitHub Issue."
[[ "$(jq -r '.state' <<<"$LIVE_ISSUE")" == "OPEN" ]] ||
  fail "Issue #$ISSUE_NUMBER is not open."
[[ "$(jq -r '.title' <<<"$LIVE_ISSUE")" == "$ISSUE_TITLE" ]] ||
  fail "The live issue title changed. Refresh and recommit the issue memory before running."

CURRENT_BRANCH="$(git branch --show-current)"
[[ -n "$CURRENT_BRANCH" ]] || fail "The repository is in detached HEAD state."
[[ "$CURRENT_BRANCH" == "$BRANCH_NAME" ]] ||
  fail "Current branch '$CURRENT_BRANCH' does not match '$BRANCH_NAME'."
[[ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]] ||
  fail "The Ralph Loop cannot run on the base branch."
[[ -z "$(git status --porcelain)" ]] ||
  fail "The worktree must be clean before starting."

COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
PRIMARY_WORKTREE="$(dirname "$COMMON_DIR")"
EXPECTED_WORKTREE_ROOT="$(dirname "$PRIMARY_WORKTREE")/$(basename "$PRIMARY_WORKTREE")-worktrees"
EXPECTED_WORKTREE="$EXPECTED_WORKTREE_ROOT/issue-$ISSUE_NUMBER"
[[ "$REPO_ROOT" == "$EXPECTED_WORKTREE" ]] ||
  fail "Issue #$ISSUE_NUMBER must run in deterministic worktree $EXPECTED_WORKTREE, not $REPO_ROOT."

while IFS= read -r workspace_manifest; do
  workspace_dir="$(dirname "$workspace_manifest")"
  [[ -f "$workspace_dir/AGENTS.md" ]] ||
    fail "Workspace $workspace_dir is missing AGENTS.md."
done < <(find games packages -mindepth 2 -maxdepth 2 -name package.json -print | sort)

fetch_and_verify_remote_state
load_pull_request

LOCK_ROOT="$COMMON_DIR/ralph-locks"
mkdir -p "$LOCK_ROOT"
BRANCH_LOCK_KEY="$(printf '%s' "$BRANCH_NAME" | git hash-object --stdin)"
WORKTREE_LOCK_KEY="$(printf '%s' "$REPO_ROOT" | git hash-object --stdin)"
acquire_lock "issue-$ISSUE_NUMBER" "issue #$ISSUE_NUMBER"
acquire_lock "branch-$BRANCH_LOCK_KEY" "branch $BRANCH_NAME"
acquire_lock "worktree-$WORKTREE_LOCK_KEY" "worktree $REPO_ROOT"

mkdir -p "$ITERATIONS_DIR"
git check-ignore -q "$ITERATIONS_DIR/.ralph-log-test.log" ||
  fail "Iteration logs under $ITERATIONS_DIR are not ignored by Git."

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
  printf 'Validated Ralph Loop for issue #%s in %s on branch %s.\n' \
    "$ISSUE_NUMBER" "$REPO_NAME_WITH_OWNER" "$BRANCH_NAME"
  printf 'Command:'
  printf ' %q' "${COPILOT_COMMAND[@]}"
  printf '\n'
  exit 0
fi

printf 'Starting Ralph Loop for issue #%s: %s\n' "$ISSUE_NUMBER" "$ISSUE_TITLE"
printf 'Repository: %s\nBranch: %s\nMemory: %s\n' \
  "$REPO_NAME_WITH_OWNER" "$BRANCH_NAME" "$MEMORY_DIR"

log_sequence=1
while [[ -e "$ITERATIONS_DIR/$(printf '%04d' "$log_sequence").log" ]]; do
  log_sequence=$((log_sequence + 1))
done

iteration=1
no_plan_progress=0
while [[ "$CONTINUOUS" == true || "$iteration" -le "$MAX_ITERATIONS" ]]; do
  [[ -z "$(git status --porcelain)" ]] ||
    fail "Iteration $iteration cannot start with uncommitted changes."
  fetch_and_verify_remote_state
  load_pull_request

  starting_commit="$(git rev-parse HEAD)"
  starting_passed_count="$(jq '[.stories[] | select(.passes == true)] | length' "$PLAN_FILE")"
  starting_story_count="$(jq '.stories | length' "$PLAN_FILE")"
  log_file="$ITERATIONS_DIR/$(printf '%04d' "$log_sequence").log"
  printf '\n=== Ralph iteration %d ===\n' "$iteration"

  set +e
  "${COPILOT_COMMAND[@]}" 2>&1 | tee "$log_file"
  copilot_status=${PIPESTATUS[0]}
  set -e

  if [[ "$copilot_status" -ne 0 ]]; then
    fail "Copilot exited with status $copilot_status. See $log_file."
  fi

  validate_plan
  assert_plan_identity

  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Iteration $iteration left uncommitted changes. Inspect the worktree and $log_file."
  fi

  ending_commit="$(git rev-parse HEAD)"
  ending_passed_count="$(jq '[.stories[] | select(.passes == true)] | length' "$PLAN_FILE")"
  ending_story_count="$(jq '.stories | length' "$PLAN_FILE")"
  reported_complete=false
  if grep -Fxq '<promise>COMPLETE</promise>' "$log_file"; then
    reported_complete=true
  fi

  if [[ "$starting_commit" == "$ending_commit" && "$reported_complete" == false ]]; then
    fail "Iteration $iteration made no commit and did not report completion."
  fi

  if [[ "$ending_passed_count" -gt "$starting_passed_count" ||
        "$ending_story_count" -gt "$starting_story_count" ||
        "$reported_complete" == true ]]; then
    no_plan_progress=0
  else
    no_plan_progress=$((no_plan_progress + 1))
    if [[ "$no_plan_progress" -ge 2 ]]; then
      fail "Two consecutive iterations committed without advancing or refining the story plan."
    fi
  fi

  fetch_and_verify_remote_state
  if ! git push --set-upstream origin "$BRANCH_NAME"; then
    fail "Iteration $iteration committed locally, but the push failed. Reconcile the branch before rerunning."
  fi

  load_pull_request
  if [[ -z "$PR_NUMBER" ]]; then
    create_pull_request
  fi
  printf 'Draft pull request: %s\n' "$PR_URL"

  if [[ "$reported_complete" == true ]]; then
    if ! jq -e 'all(.stories[]; .passes == true)' "$PLAN_FILE" >/dev/null; then
      printf 'Completion was reported, but unfinished stories remain. Continuing.\n'
      iteration=$((iteration + 1))
      log_sequence=$((log_sequence + 1))
      continue
    fi

    if check_pull_request_gates; then
      printf 'Ralph Loop completed issue #%s with passing CI checks.\n' \
        "$ISSUE_NUMBER"
      exit 0
    fi

    printf 'Completion was reported, but pull request checks failed. Continuing.\n'
  fi

  iteration=$((iteration + 1))
  log_sequence=$((log_sequence + 1))
done

printf 'Ralph Loop reached %s iterations before completion.\n' "$MAX_ITERATIONS" >&2
exit 2
