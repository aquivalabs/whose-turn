# Whose Turn

A local monitor that answers "what is waiting on me right now" across Jira and GitHub. It polls both about once a minute, keeps state on disk, pushes changes live to a window over server-sent events, sends a desktop notification when something becomes your move, and keeps your personal to-dos. It also ships as a Claude Code plugin, so a session starts with "N your move · M unread · K to-do" already in context.

Python 3.9 standard library on the server, plain JavaScript in the window, no build step.

## Workspace config

Nothing that names an employer, an account or a team process lives in this repository. It all sits in one file on the machine that owns it:

| platform | config file |
|---|---|
| macOS | `~/Library/Application Support/whose-turn/config.json` |
| Linux | `$XDG_CONFIG_HOME/whose-turn/config.json`, default `~/.config/whose-turn/config.json` |
| Windows | `%APPDATA%\whose-turn\config.json` |

`WHOSE_TURN_DATA` overrides the whole directory, `WHOSE_TURN_CONFIG` the config file alone, `WHOSE_TURN_PORT` the port. Copy `config.example.json` there and fill in:

| key | meaning |
|---|---|
| `github.repo` | the repository whose PRs are yours, `owner/name` |
| `github.org` | notifications are kept only from this org; defaults to the repo owner |
| `github.me` | your GitHub login; left empty, it is asked from the API once |
| `github.bots` | logins whose comments never count as a human reply |
| `jira.base` | your Jira Cloud site |
| `jira.email` | the account the API token belongs to |
| `jira.key_pattern` | regex for ticket keys in PR titles and to-dos; the default matches any Jira key |
| `jira.jql` | which tickets to watch |
| `rules.release_branch_prefix` | PRs into these branches follow the release flow |
| `rules.approved_next`, `rules.approved_release_next` | what to do when a PR in code review is approved, for a normal and a release branch |

Secrets never go into the config. GitHub uses `gh auth token`. The Jira API token lives in the macOS Keychain under `jira.keychain_service`; `set-jira-token.sh` puts it there from the clipboard. A launch agent that is refused Keychain access can read a 600-mode `jira-token` file next to the state instead.

State lives next to the config: `state.json` (last poll), `marks.json` (read, handled, notified), `todos.json`.

## Files

| file | role |
|---|---|
| `server.py` | polls the sources, keeps state, serves the window, SSE stream, JSON API, notifications |
| `index.html`, `app.js`, `style.css` | the window |
| `vendor/` | Tippy.js 6.3.7 and Popper 2.11.8, pinned, served locally |
| `install.sh` | macOS launch agent `local.whose-turn`: start at login, restart on crash, log to `~/Library/Logs/whose-turn.log` |
| `open.sh` | opens the window as a Chrome app window |
| `set-jira-token.sh` | clipboard to Keychain, then clears the clipboard |
| `.claude-plugin/`, `hooks/`, `commands/`, `skills/`, `bin/` | the Claude Code plugin |

## Sources and polling

**GitHub**, token from `gh auth token`:

- `search/issues` finds your open PRs and PRs updated in the last `history_days`. Full details are fetched only for PRs whose `updated_at` changed: PR, reviews, issue comments, inline comments, check runs.
- Open PRs get their check runs re-polled every cycle, because CI finishing does not bump `updated_at`.
- `/notifications?participating=true` gives review requests and @-mentions on PRs and issues that are not yours, filtered to `github.org`.
- Every GET carries an ETag; a 304 does not count against the 5000/h limit. Steady state is about 1 to 10 requests a minute.
- On a 403 or 429 rate limit the delay doubles up to 15 minutes, then returns to `poll_seconds`.

**Jira Cloud REST**, email plus API token, Basic auth:

- `POST /rest/api/3/search/jql` with `jira.jql`. Fields: summary, status, assignee, updated, comment. All comments are kept. Comment bodies arrive as ADF and are turned into Markdown-ish text: mentions become `@Name`, media becomes `[image]`.
- `GET /rest/api/3/issue/{key}/changelog` for each open ticket tells when and by whom it entered its current status. Cached until the ticket's `updated` changes.
- Status and assignee changes between polls become feed events.

## Rules: whose turn

Each ticket is joined with its PR by the ticket key in the PR title. The first match wins:

1. Open PR has failing checks: your move, "Look at the failing checks".
2. Changes requested: "Address the requested changes".
3. A human commented on your open PR after your last comment there, and it is not an approval: "Read and answer the new comment".
4. Status contains "Passed": "Merge with a merge commit, log time, move to Done".
5. Ticket done but PR open: "merge it".
6. PR merged, ticket not done and on you: "Log time and move to Done".
7. Code review and the PR is approved: `rules.approved_release_next` for a release branch, otherwise `rules.approved_next`.
8. Code review, not approved: the reviewer's turn. Ready for QA or In QA: QA's turn. On Hold: their turn, with the reason.
9. On you and nothing above: "Pick it up".
10. Backlog and not on you: hidden.

Extra rows, one per item:

- **Jira:** a comment by a human that @-mentions you in the last `history_days` and is not answered. It is a question if it has `?` outside links, or words like please, can you, let me know, recommend, confirm. Otherwise it is "read". Your later comment answers only the people it @-mentions.
- **GitHub notifications:** "Review PR #N" while you are still a requested reviewer. "Answer X on #N" until you comment there after the mention.

The On Hold reason is the comment by whoever moved the ticket to On Hold, closest to that moment. If there is none, the last comment before it. As a last resort, the newest comment saying "on hold". Shown on one line, with the full comment in a tooltip and a link.

Handled marks hide a row until something newer happens on it. Desktop notifications fire for new "your move" rows. The first run only records the existing rows.

**Known problem:** these rules exist twice, in `server.py` (`my_moves`, used for notifications and `/api/summary`) and in `app.js` (`turnRows`, used for the window). They belong on the server only.

## API, `127.0.0.1:<port>`

- `GET /api/state`: everything, including `jira`, `jira_comments`, `prs`, `activity`, `events`, `gh_asks`, `marks`, `todos`, `errors`, `polled_at`, `me` and the public part of `config`.
- `GET /api/summary`: `moves`, `new_events`, `todos`, `polled_at`, `errors`.
- `GET /api/stream`: SSE. One `data:` event per poll, `{version, polled_at}`. The window reloads state when `version` changes.
- `POST /api/marks` takes `{seen:[ids], base:ms, handled:{row_id: iso|null}, notified:[ids]}`.
- `POST /api/todos` actions: `add {text, key?, by?}`; `done`, `undo`, `delete` with `{id}`; `edit {id, text}`.
- `POST /api/refresh` polls now. `POST /api/notify` takes `{title, body}`.

## The window

- Material 3 plus glass: tonal surfaces seeded from a brand blue, translucent blurred islands with 12 px corners, dark and light schemes, a gradient header with stat tiles.
- Two columns. Left: Your move, To do, Waiting on others. Right: the feed. The page never scrolls; each island scrolls inside, with sticky table headers.
- Every header is one line, truncated with an ellipsis. Anything that hides more text gets a "?" icon at the end. Tooltips are Tippy: instant, also on click, interactive, keep line breaks.
- Your move: one row per thing to do, with a "?" for why it is there, an age chip (amber after 24 h) and a Handled button. An Open / Handled switch sits in the header.
- Waiting on others: who holds the ticket and for how long, from the changelog (amber after 3 days). For On Hold, the one-line reason with a tooltip.
- Feed: newest first, All / GitHub / Jira filter, unread items highlighted until clicked plus "Mark all read". Only written things expand. "Open formatted" renders the Markdown safely from DOM nodes, never innerHTML. A "@you" tag marks mentions.
- To do: an input, checkboxes, a "Done N" toggle; ticket keys become links. Claude adds items through the API.
- Status line: live dot, "last check Xs ago", Refresh now, and a banner for source or config errors.

## Claude Code plugin

| part | what it does |
|---|---|
| `hooks/hooks.json` and `bin/session-summary.sh` | at SessionStart, kicks the launch agent if it is down and injects "N your move · M unread · K to-do" plus details into context |
| `commands/whose-turn.md` | `/whose-turn` opens the window |
| `skills/whose-turn/SKILL.md` | answers "what's on me" from `/api/summary`, and adds or finishes to-dos through `/api/todos` |
| `bin/statusline.sh` | optional status line, not wired yet |

For development, add this checkout as a local marketplace: `claude plugin marketplace add <path to this folder>`, then install `whose-turn@whose-turn-dev`.

## Roadmap, in order

1. **Adapters and one place for rules.** One adapter per source returns normalized events, asks and ticket rows. The rules run once on the server; the window only renders.
2. **Workspace config in the window.** Edit the config from the UI instead of a JSON file.
3. **Cross-platform layers.** Autostart: launchd, systemd user unit, Windows Task Scheduler. Secrets: Keychain, libsecret, Windows Credential Manager, for example through `keyring`. Notifications: osascript, notify-send, Windows toast. Today only macOS is complete; Linux gets notify-send and a config path.
4. **Persist the PR cache to disk.** A restart costs about 95 GitHub requests.
5. **Health alerts.** Notify when data is older than 15 minutes or a source keeps failing.
6. **Jira coverage.** Mentions on tickets never assigned to you are not seen. Try watched issues, or find a better source.
7. **Ordering and history.** In Your move: failing checks and changes requested first. Add a collapsed "Recently done" list.
8. **New sources** as adapters: Slack, mail, calendar, CI.

## Operating notes

- Restart after a code change: `kill $(lsof -tnP -iTCP:8765 -sTCP:LISTEN)`; launchd brings it back.
- The first poll after a restart takes about a minute while the PR cache is rebuilt.
- macOS gotcha: `security add-generic-password … -w` run through a non-interactive shell silently stores an empty password. Pass the value as `-w "$value"`, as `set-jira-token.sh` does.
- A sandboxed agent shell cannot read Keychain. The launch agent can.
