#!/bin/zsh
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-https://digitalaelle.se/dashboard}"

if [ -d "/Applications/Google Chrome.app" ]; then
  /usr/bin/open -na "Google Chrome" --args --new-window "$DASHBOARD_URL"
else
  /usr/bin/open "$DASHBOARD_URL"
fi
