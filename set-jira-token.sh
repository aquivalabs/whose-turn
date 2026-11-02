#!/bin/zsh
# Saves the Jira API token from the clipboard into Keychain for one account, then clears the clipboard.
# Usage: set-jira-token.sh <jira email> [service, default whose-turn-jira]
email=$1
service=${2:-whose-turn-jira}
if [ -z "$email" ]; then
  echo "Usage: $0 <jira email> [service]"
  exit 1
fi
t=$(pbpaste | tr -d '\n\r ')
if [ ${#t} -lt 20 ]; then
  echo "Clipboard did not hold a token (${#t} characters). Copy the token, then run this again."
  exit 1
fi
security add-generic-password -U -a "$email" -s "$service" -w "$t"
unset t
pbcopy < /dev/null
echo "Saved to Keychain (service $service, account $email). The clipboard is cleared. The monitor picks it up within a minute."
