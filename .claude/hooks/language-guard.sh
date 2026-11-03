#!/usr/bin/env bash
# PostToolUse(Write|Edit): every file written in this repo is English. AGENTS.md, "Hard rules".
# Cyrillic is allowed only under .users-files/ (the user's own notes, gitignored). Blocks so the model fixes it at once.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$f" ] && [ -f "$f" ] || exit 0
case "$f" in
  *users-files/*) exit 0 ;;
  *.md|*.txt|*.json|*.yaml|*.yml|*.js|*.mjs|*.cjs|*.ts|*.html|*.css|*.sh|*.py|*.svg) ;;
  *) exit 0 ;;
esac
perl -CSD -ne 'exit 1 if /\p{Cyrillic}/' "$f" && exit 0
printf '{"decision":"block","reason":"language guard: Cyrillic in %s. This repo is English only (AGENTS.md, Hard rules); the only exception is .users-files/. Rewrite the Cyrillic parts in English now.","systemMessage":"language guard: Cyrillic in %s; the repo is English only."}\n' "$f" "$f"
