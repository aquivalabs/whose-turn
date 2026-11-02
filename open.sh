#!/bin/zsh
# Opens the monitor as its own app window (Chrome app mode), or in the default browser if Chrome is missing.
URL=http://127.0.0.1:${WHOSE_TURN_PORT:-8765}/
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app=$URL --window-size=1500,950
else
  open $URL
fi
