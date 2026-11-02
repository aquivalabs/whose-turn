#!/bin/zsh
# Optional status line: "▲ 2 your move · 5 unread". Point settings.json "statusLine" at this file to use it.
exec /usr/bin/python3 ${0:a:h}/summary.py status
