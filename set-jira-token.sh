#!/bin/zsh
# Saves the Jira API token from the clipboard into Keychain for the monitor, then clears the clipboard.
t=$(pbpaste | tr -d '\n\r ')
if [ ${#t} -lt 20 ]; then
  echo "Clipboard did not hold a token (${#t} characters). Copy the token, then run this again."
  exit 1
fi
cfg="${WHOSE_TURN_CONFIG:-$HOME/Library/Application Support/whose-turn/config.json}"
email=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["jira"]["email"])' "$cfg" 2>/dev/null)
service=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["jira"].get("keychain_service","whose-turn-jira"))' "$cfg" 2>/dev/null)
if [ -z "$email" ]; then
  echo "No jira.email in $cfg. Fill the workspace config first."
  exit 1
fi
security add-generic-password -U -a "$email" -s "${service:-whose-turn-jira}" -w "$t"
unset t
pbcopy < /dev/null
echo "Saved to Keychain (service ${service:-whose-turn-jira}). The clipboard is cleared. The monitor picks it up within a minute."
