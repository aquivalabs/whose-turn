#!/usr/bin/env bash
# Opens the monitor as its own Chrome or Edge app window at the remembered size, or in a browser tab with --browser or when neither is installed.
port=${WHOSE_TURN_PORT:-8765}
base=http://127.0.0.1:$port
width=1500
height=950

size=$(curl -fs --max-time 1 "$base/api/window" 2>/dev/null)
[[ $size =~ \"width\":([0-9]+) ]] && width=${BASH_REMATCH[1]}
[[ $size =~ \"height\":([0-9]+) ]] && height=${BASH_REMATCH[1]}

tab() {
  if [[ $(uname) == Darwin ]]; then open "$base/"; else xdg-open "$base/"; fi
}

if [[ $1 == --browser ]]; then
  tab
  exit
fi

url="$base/?mode=app"
size_flag=--window-size=$width,$height

if [[ $(uname) == Darwin ]]; then
  if open -Ra "Google Chrome" 2>/dev/null; then
    open -na "Google Chrome" --args --app="$url" "$size_flag"
  else
    tab
  fi
  exit
fi

for browser in google-chrome chromium chromium-browser microsoft-edge; do
  if command -v "$browser" >/dev/null; then
    "$browser" --app="$url" "$size_flag" >/dev/null 2>&1 &
    disown
    exit
  fi
done
tab
