#!/bin/zsh
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-https://digitalaelle.se/dashboard}"
STATE_DIR="$HOME/Library/Application Support/DigitalaElleDashboard"
STAMP_FILE="$STATE_DIR/last-opened.txt"
TODAY="$(/bin/date +%F)"
CURRENT_HOUR="$(/bin/date +%H)"

mkdir -p "$STATE_DIR"

if [ "${FORCE_OPEN:-0}" != "1" ]; then
  if [ "$CURRENT_HOUR" -lt 8 ]; then
    echo "Too early to open dashboard: $(/bin/date)"
    exit 0
  fi

  if [ -f "$STAMP_FILE" ] && [ "$(<"$STAMP_FILE")" = "$TODAY" ]; then
    echo "Dashboard already opened today: $TODAY"
    exit 0
  fi
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  /usr/bin/open -na "Google Chrome" --args --new-window "$DASHBOARD_URL"
else
  /usr/bin/open "$DASHBOARD_URL"
fi

echo "$TODAY" > "$STAMP_FILE"
echo "Opened dashboard: $(/bin/date)"
