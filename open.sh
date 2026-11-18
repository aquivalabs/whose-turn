#!/usr/bin/env bash
# Opens the monitor as its own Chrome or Edge app window at the remembered size, or in a browser tab with --browser or when neither is installed.
# When the server answers, the app window must connect within WHOSE_TURN_OPEN_WAIT seconds, or a tab opens instead and the exit is 1. RMA-463.
port=${WHOSE_TURN_PORT:-8765}
base=http://127.0.0.1:$port
width=1500
height=950

window() {
  curl -fs --max-time 1 "$base/api/window" 2>/dev/null
}

count() {
  [[ $1 =~ \"windows\":([0-9]+) ]] && echo "${BASH_REMATCH[1]}"
}

size=$(window)
[[ $size =~ \"width\":([0-9]+) ]] && width=${BASH_REMATCH[1]}
[[ $size =~ \"height\":([0-9]+) ]] && height=${BASH_REMATCH[1]}
before=$(count "$size")

tab() {
  if [[ $(uname) == Darwin ]]; then open "$base/"; else xdg-open "$base/"; fi
}

confirm() {
  [[ -z $before ]] && exit 0
  local wait=${WHOSE_TURN_OPEN_WAIT:-10} tries now
  for ((tries = 0; tries < wait * 2; tries += 1)); do
    now=$(count "$(window)")
    [[ -n $now && $now -gt $before ]] && exit 0
    sleep 0.5
  done
  echo "The app window did not open within ${wait}s; opened the monitor in a browser tab instead." >&2
  tab
  exit 1
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
    confirm
  fi
  tab
  exit
fi

for browser in google-chrome chromium chromium-browser microsoft-edge; do
  if command -v "$browser" >/dev/null; then
    "$browser" --app="$url" "$size_flag" >/dev/null 2>&1 &
    disown
    confirm
  fi
done
tab
