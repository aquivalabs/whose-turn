#!/usr/bin/env bash
# Installs Whose Turn so it starts at login and restarts if it stops: a launchd agent on macOS, a systemd user unit on Linux.
# Undo (macOS): launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/local.whose-turn.plist && rm that plist.
# Undo (Linux): systemctl --user disable --now whose-turn && rm ~/.config/systemd/user/whose-turn.service
set -e
DIR=$(cd "$(dirname "$0")" && pwd -P)
if [[ ! -f $DIR/dist/index.html ]]; then
  echo "No built window in $DIR: dist/index.html is missing. A released whose-turn package carries it; in a development checkout run npm run build first."
  exit 1
fi
NODE=$(command -v node) || { echo "Node 22 or newer is needed on PATH."; exit 1; }
NODE_DIR=$(dirname "$NODE")
PORT=$("$NODE" --input-type=module -e "const { pathToFileURL } = await import('node:url'); const { defaultDataDir, resolvePort } = await import(pathToFileURL(process.argv[1]).href); console.log(resolvePort(process.env.WHOSE_TURN_DATA || defaultDataDir()))" "$DIR/lib/config.mjs")
URL="http://127.0.0.1:${PORT:-8765}/"
PASSED=()
[[ -n ${WHOSE_TURN_DATA:-} ]] && PASSED+=(WHOSE_TURN_DATA)
[[ -n ${WHOSE_TURN_PORT:-} ]] && PASSED+=(WHOSE_TURN_PORT)
PASSED_NOTE=""
((${#PASSED[@]})) && PASSED_NOTE=" ${PASSED[*]} from this shell $([[ ${#PASSED[@]} -gt 1 ]] && echo are || echo is) written into it."

xml_escape() { local v=${1//&/&amp;}; v=${v//</&lt;}; echo "${v//>/&gt;}"; }

install_macos() {
  local plist=$HOME/Library/LaunchAgents/local.whose-turn.plist
  local log=$HOME/Library/Logs/whose-turn.log
  local extra="" name
  for name in "${PASSED[@]}"; do extra+="<key>$name</key><string>$(xml_escape "${!name}")</string>"; done
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
  cat > "$plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.whose-turn</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>$extra</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict></plist>
PL
  launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "Installed. The monitor runs at $URL and starts at login.$PASSED_NOTE"
}

install_linux() {
  command -v systemctl > /dev/null || { echo "systemd is needed: systemctl is not on PATH."; exit 1; }
  local unit_dir=$HOME/.config/systemd/user
  local extra="" name
  for name in "${PASSED[@]}"; do extra+="Environment=\"$name=${!name}\""$'\n'; done
  mkdir -p "$unit_dir"
  cat > "$unit_dir/whose-turn.service" <<UNIT
[Unit]
Description=Whose Turn monitor

[Service]
ExecStart="$NODE" "$DIR/server.mjs"
WorkingDirectory=$DIR
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
${extra}Restart=on-failure

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now whose-turn
  echo "Installed. The monitor runs at $URL and starts at login. Logs: journalctl --user -u whose-turn.$PASSED_NOTE"
}

case "$(uname -s)" in
  Darwin) install_macos ;;
  Linux) install_linux ;;
  *)
    echo "No installer for this platform. On Windows, run this once in a terminal, with your node.exe and this folder:"
    echo '  schtasks /Create /SC ONLOGON /TN whose-turn /TR "\"<path to node.exe>\" \"<this folder>\server.mjs\""'
    exit 1
    ;;
esac
