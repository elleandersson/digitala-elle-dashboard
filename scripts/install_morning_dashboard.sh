#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_ID="se.digitalaelle.instagram-dashboard"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_ID}.plist"
OPEN_SCRIPT="$PROJECT_DIR/scripts/open_dashboard.sh"
LOG_DIR="$HOME/Library/Logs/DigitalaElleDashboard"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$LOG_DIR"
chmod +x "$OPEN_SCRIPT"

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
    <string>${OPEN_SCRIPT}</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StartInterval</key>
  <integer>900</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/morning-dashboard.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/morning-dashboard.err</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

echo "Installerat: dashboarden öppnas en gång per dag efter kl 08:00."
echo "Den kontrollerar även var 15:e minut, så den funkar bättre om datorn sover kl 08:00."
echo "LaunchAgent: $PLIST_PATH"
echo "Logg: ${LOG_DIR}/morning-dashboard.log"
