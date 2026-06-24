#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$HOME/Library/Application Support/DigitalaElleDashboard"
LOG_PREFIX="[instagram-watchdog]"
STAMP_FILE="$STATE_DIR/last-watchdog-trigger.txt"
WATCHDOG_FILE_REL=".github/instagram-watchdog.txt"
WATCHDOG_BRANCH="${WATCHDOG_BRANCH:-main}"
CHECK_SCRIPT="$PROJECT_DIR/scripts/check_instagram_freshness.py"
TRIGGER_AFTER_HOUR="${TRIGGER_AFTER_HOUR:-4}"
TRIGGER_AFTER_MINUTE="${TRIGGER_AFTER_MINUTE:-45}"
NOW_HOUR="$(/bin/date +%H)"
NOW_MINUTE="$(/bin/date +%M)"
TODAY="$(/bin/date +%F)"

mkdir -p "$STATE_DIR"

log() {
  echo "$LOG_PREFIX $*"
}

if [ "${FORCE_WATCHDOG_TRIGGER:-0}" != "1" ]; then
  if [ "$NOW_HOUR" -lt "$TRIGGER_AFTER_HOUR" ] || { [ "$NOW_HOUR" -eq "$TRIGGER_AFTER_HOUR" ] && [ "$NOW_MINUTE" -lt "$TRIGGER_AFTER_MINUTE" ]; }; then
    log "Too early to trigger fallback: $(/bin/date)"
    exit 0
  fi
fi

CHECK_OUTPUT="$(python3 "$CHECK_SCRIPT" 2>&1)" || CHECK_STATUS=$?
CHECK_STATUS="${CHECK_STATUS:-0}"
echo "$CHECK_OUTPUT"

if [ "$CHECK_STATUS" -eq 0 ]; then
  log "Dashboard data is already fresh."
  exit 0
fi

if [ -f "$STAMP_FILE" ] && [ "$(<"$STAMP_FILE")" = "$TODAY" ] && [ "${FORCE_WATCHDOG_TRIGGER:-0}" != "1" ]; then
  log "Fallback already triggered today: $TODAY"
  exit 0
fi

TEMP_WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/igdash-watchdog.XXXXXX")"
cleanup() {
  git -C "$PROJECT_DIR" worktree remove --force "$TEMP_WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_WORKTREE"
}
trap cleanup EXIT

log "Creating temporary worktree for fallback trigger."
git -C "$PROJECT_DIR" fetch origin "$WATCHDOG_BRANCH"
git -C "$PROJECT_DIR" worktree add --detach "$TEMP_WORKTREE" "origin/$WATCHDOG_BRANCH" >/dev/null

WATCHDOG_FILE="$TEMP_WORKTREE/$WATCHDOG_FILE_REL"
mkdir -p "$(dirname "$WATCHDOG_FILE")"
cat > "$WATCHDOG_FILE" <<EOF
triggered_at=$(date -u +%FT%TZ)
triggered_local=$(TZ=Europe/Stockholm date +%FT%T%z)
reason=stale-dashboard-data
details=$(printf '%s\n' "$CHECK_OUTPUT" | tr '\n' '; ')
EOF

git -C "$TEMP_WORKTREE" add "$WATCHDOG_FILE_REL"

if git -C "$TEMP_WORKTREE" diff --cached --quiet; then
  log "No watchdog diff to commit."
  echo "$TODAY" > "$STAMP_FILE"
  exit 0
fi

git -C "$TEMP_WORKTREE" config user.name "Digitala Elle Watchdog"
git -C "$TEMP_WORKTREE" config user.email "elle.andersson@gmail.com"
git -C "$TEMP_WORKTREE" commit -m "chore: trigger instagram watchdog refresh" >/dev/null

if [ "${WATCHDOG_DRY_RUN:-0}" = "1" ]; then
  log "Dry run: created fallback commit but skipped push."
  exit 0
fi

log "Pushing fallback trigger commit to origin/$WATCHDOG_BRANCH."
git -C "$TEMP_WORKTREE" push origin "HEAD:$WATCHDOG_BRANCH"
echo "$TODAY" > "$STAMP_FILE"
log "Fallback trigger pushed successfully."
