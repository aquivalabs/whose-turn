#!/usr/bin/env python3
# Formats the monitor's /api/summary for the SessionStart hook ("hook") or the status line ("status").
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

mode = sys.argv[1] if len(sys.argv) > 1 else "hook"
try:
    with urllib.request.urlopen("http://127.0.0.1:8765/api/summary", timeout=3) as r:
        d = json.load(r)
except Exception:
    if mode == "status":
        print("whose-turn: off")
    else:
        print(json.dumps({"systemMessage": "Whose Turn monitor is not running. Install it with %s/install.sh" % ROOT}))
    sys.exit(0)

moves = d.get("moves", [])
todos = d.get("todos", [])
unread = d.get("new_events", 0)
errors = d.get("errors") or {}
if mode == "status":
    print("▲ %d your move · %d unread%s%s" % (len(moves), unread, " · %d to-do" % len(todos) if todos else "", " · error" if errors else ""))
    sys.exit(0)

lines = ["- %s: %s (%s)" % (m["key"], m["next"], m["url"]) for m in moves]
ctx = "Whose Turn monitor (local, http://127.0.0.1:8765, last check %s). " % (d.get("polled_at") or "never")
ctx += ("Your move (%d):\n" % len(moves) + "\n".join(lines)) if moves else "Nothing is waiting on the user."
ctx += "\nUnread feed events: %d." % unread
if todos:
    ctx += "\nOpen to-dos (%d):\n" % len(todos) + "\n".join("- " + t["text"] for t in todos[:10])
if errors:
    ctx += "\nMonitor errors: " + "; ".join("%s: %s" % kv for kv in errors.items())
msg = "Whose Turn: %d your move" % len(moves)
if moves:
    msg += " — " + "; ".join("%s %s" % (m["key"], m["next"]) for m in moves[:3])
msg += " · %d unread" % unread + (" · %d to-do" % len(todos) if todos else "") + (" · monitor error" if errors else "")
print(json.dumps({"systemMessage": msg, "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx}}))
