#!/bin/zsh
# SessionStart: make sure the monitor runs, then hand Claude and the user a short "whose turn" summary.
URL=http://127.0.0.1:${WHOSE_TURN_PORT:-8765}
if ! curl -s -m 2 $URL/api/summary >/dev/null 2>&1; then
  launchctl kickstart gui/$(id -u)/local.whose-turn >/dev/null 2>&1
  for i in 1 2 3 4 5; do curl -s -m 2 $URL/api/summary >/dev/null 2>&1 && break; sleep 1; done
fi
exec node ${0:a:h}/summary.mjs hook
