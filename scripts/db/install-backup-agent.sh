#!/usr/bin/env bash
# Run scripts/db/backup.sh at login and every evening at 21:00, on this Mac.
#
#   scripts/db/install-backup-agent.sh             install, or update after moving the repo
#   scripts/db/install-backup-agent.sh --remove    stop and remove it
#
# A launchd agent rather than cron: cron skips a run while the laptop is
# asleep, and launchd runs a missed calendar job when it wakes. backup.sh
# keeps one copy a day, so the login run and the evening run do not double up.
set -euo pipefail

LABEL=com.funktion.db-backup
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/backup.sh"
LOG_DIR="${FUNKTION_BACKUP_DIR:-$HOME/Backups/FunktionPortal}"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

if [ "${1:-}" = "--remove" ]; then
  rm -f "$PLIST"
  echo "Removed $LABEL."
  exit 0
fi

chmod +x "$SCRIPT"
mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"
chmod 700 "$LOG_DIR"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>21</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/agent.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/agent.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL: runs at login and daily at 21:00. Copies go to $LOG_DIR."
