#!/bin/zsh
# Installs Whose Turn as a macOS login agent: starts at login, restarts if it stops.
# Undo: launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/local.whose-turn.plist && rm that plist.
set -e
DIR=${0:a:h}
NODE=$(command -v node) || { echo "Node 22 or newer is needed on PATH."; exit 1; }
PLIST=~/Library/LaunchAgents/local.whose-turn.plist
LOG=~/Library/Logs/whose-turn.log
mkdir -p ~/Library/LaunchAgents ~/Library/Logs
cat > $PLIST <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.whose-turn</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${NODE:h}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
launchctl bootout gui/$(id -u) $PLIST 2>/dev/null || true
launchctl bootstrap gui/$(id -u) $PLIST
echo "Installed. The monitor runs at http://127.0.0.1:8765/ and starts at login."
