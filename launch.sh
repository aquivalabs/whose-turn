#!/usr/bin/env bash
# Starts server.mjs with whichever node the login shell resolves now, then PATH, then the install-time hint.
DIR=$(cd "$(dirname "$0")" && pwd -P)
NODE=""
if [[ -n ${SHELL:-} && -x $SHELL ]]; then
  NODE=$("$SHELL" -lc 'command -v node' 2> /dev/null | tail -n 1)
fi
[[ -x $NODE ]] || NODE=$(command -v node) || NODE=""
[[ -x $NODE ]] || NODE=${WHOSE_TURN_NODE:-}
[[ -x $NODE ]] || { echo "whose-turn: no node found in the login shell or on PATH; install Node 22 or newer."; exit 1; }
exec "$NODE" "$DIR/server.mjs"
