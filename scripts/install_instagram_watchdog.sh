#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_ID="se.digitalaelle.instagram-watchdog"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_ID}.plist"
WATCHDOG_SCRIPT="$PROJECT_DIR/scripts/trigger_instagram_refresh_if_stale.sh"
LOG_DIR="$HOME/Library/Logs/DigitalaElleDashboard"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$LOG_DIR"
chmod +x "$WATCHDOG_SCRIPT"
chmod +x "$PROJECT_DIR/scripts/check_instagram_freshness.py"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_ID}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${WATCHDOG_SCRIPT}</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>4</integer>
    <key>Minute</key>
    <integer>45</integer>
  </dict>

  <key>StartInterval</key>
  <integer>900</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/instagram-watchdog.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/instagram-watchdog.err</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

echo "Installerat: fallback-watchdog för Instagram kör från kl 04:45."
echo "Den kontrollerar sedan var 15:e minut tills datan är färsk eller fallback redan är triggad."
echo "LaunchAgent: $PLIST_PATH"
echo "Logg: ${LOG_DIR}/instagram-watchdog.log"
