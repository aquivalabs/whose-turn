# Whose Turn

A local monitor that answers "what is waiting on me right now" across your sources: Jira and GitHub today, Linear next. It polls each source about once a minute, evaluates the "whose turn" rules once on the server, pushes changes live to a window, sends a desktop notification when something becomes your move, and keeps your personal to-dos. It also ships as a Claude Code plugin, so a session starts with "N your move · M unread · K to-do" already in context.

Node 22, no dependencies, no build step. The window is plain JavaScript.

## Workspaces and connectors

A **workspace** is one place you work: a project, a client, a side venture. It has its own connectors, its own feed and its own to-dos; nothing is mixed between workspaces. A **connector** is the code for one source type (`connectors/github.mjs`, `connectors/jira.mjs`): it takes one connector entry of a workspace (an account and its filters) and returns normalised `tickets`, `comments`, `prs`, `activity` and `asks`, plus `me` (your name there) and, for a ticket source, `ticket_base`. It holds no rules and knows no employer. The server stamps every row with the entry's id as `source`, merges all entries by kind and runs the rules over the merged view, so a workspace may hold two entries of one type (two repositories, two Jira sites) when each carries its own `id`.

Nothing that names an employer, an account or a team process lives in this repository. It all sits in one file on the machine that owns it:

| platform | config file |
|---|---|
| macOS | `~/Library/Application Support/whose-turn/config.json` |
| Linux | `$XDG_CONFIG_HOME/whose-turn/config.json`, default `~/.config/whose-turn/config.json` |
| Windows | `%APPDATA%\whose-turn\config.json` |

`WHOSE_TURN_DATA` overrides the whole directory, `WHOSE_TURN_CONFIG` the config file alone, `WHOSE_TURN_PORT` the port. Copy `config.example.json` there and fill in:

| key | meaning |
|---|---|
| `port`, `poll_seconds`, `history_days` | the port, how often to poll, how far back the feed reaches |
| `workspaces[].id`, `name` | a short id used in the API and the display name |
| `workspaces[].key_pattern` | regex for ticket keys in PR titles and to-dos; the default matches any Jira-style key |
| `workspaces[].connectors` | an object keyed by type, or a list of `{type, id?, label?, …}` entries when one type appears twice |
| `…connectors.github.repo` | the repository whose PRs are yours, `owner/name` |
| `…github.org` | notifications are kept only from this org; defaults to the repo owner |
| `…github.me` | your GitHub login; left empty, it is asked from the API once |
| `…github.account` | which `gh` account's token to use when several are logged in |
| `…github.bots` | logins whose comments never count as a human reply |
| `…connectors.jira.base` | your Jira Cloud site, `https://` only |
| `…jira.email` | the account the API token belongs to |
| `…jira.token_service` | the secret-store entry holding the token, default `whose-turn-jira` |
| `…jira.jql` | which tickets to watch |
| `workspaces[].rules` | the team's process, see Rules below |
| `workspaces[].theme.seed` | optional hex colour, `#rrggbb`; the window derives its light and dark Material 3 scheme from it (`lib/palette.mjs`); without it the stylesheet's blue stays |
| `workspaces[].theme.accent` | optional second hex that sets the tertiary hue; defaults to the seed's hue turned by 80 degrees |

A flat config with `github`, `jira` and `rules` at the top level still loads as one workspace named `default`.

Secrets never go into the config. GitHub uses `gh auth token`. The Jira API token lives in the macOS Keychain under the service and the account email; paste it into the settings sheet or send it through the API, and the server stores it. Elsewhere, or for a launch agent that is refused Keychain access, the server keeps it in `<data>/secrets/<service>@<account>` with mode 600.


State lives next to the config, per workspace: `workspaces/<id>/state.json` (last poll), `marks.json` (read, handled, notified), `todos.json`.

## Files

| file | role |
|---|---|
| `server.mjs` | entry: config, the poll loop with rate-limit backoff, the API |
| `lib/config.mjs` | data directory, defaults, the workspace list |
| `lib/workspace.mjs` | one workspace: polls its connectors, merges results, derives events, evaluates rules, notifies |
| `lib/rules.mjs` | the "whose turn" rules and the feed |
| `lib/palette.mjs` | a workspace's light and dark scheme from its theme seed |
| `lib/api.mjs` | the local HTTP API, SSE stream and static files |
| `lib/http-client.mjs`, `lib/secrets.mjs`, `lib/notify.mjs`, `lib/store.mjs`, `lib/errors.mjs`, `lib/text.mjs` | ETag fetch, secret lookup, desktop notification, files on disk, the error envelope, text helpers |
| `connectors/` | one module per source type |
| `index.html`, `app.js`, `style.css` | the window |
| `backdrop.js` | the dot-drawn animal on the window's backdrop |
| `vendor/` | Tippy.js 6.3.7 and Popper 2.11.8, pinned, served locally |
| `install.sh` | macOS launch agent `local.whose-turn`: start at login, restart on crash, log to `~/Library/Logs/whose-turn.log` |
| `open.sh` | opens the window as a Chrome app window |
| `.claude-plugin/`, `hooks/`, `commands/`, `skills/`, `bin/` | the Claude Code plugin |
| `test/` | `node:test` suite: rules, config, ADF conversion |

## Sources and polling

**GitHub**, token from `gh auth token`:

- `search/issues` finds your open PRs and PRs updated in the last `history_days`. Full details are fetched only for PRs whose `updated_at` changed: PR, reviews, issue comments, inline comments, check runs.
- Open PRs get their check runs re-polled every cycle, because CI finishing does not bump `updated_at`.
- `/notifications?participating=true` gives review requests and @-mentions on PRs and issues that are not yours, filtered to the org.
- Every GET carries an ETag; a 304 does not count against the 5000/h limit. Steady state is about 1 to 10 requests a minute per workspace.
- The token is sent only to `https://api.github.com/`.

**Jira Cloud REST**, email plus API token, Basic auth:

- `POST /rest/api/3/search/jql` with the workspace's JQL. Fields: summary, status, assignee, updated, comment. All comments are kept. Comment bodies arrive as ADF and are turned into Markdown-ish text: mentions become `@Name`, media becomes `[image]`.
- `GET /rest/api/3/issue/{key}/changelog` for each open ticket tells when and by whom it entered its current status. Cached until the ticket's `updated` changes.
- Status and assignee changes between polls become feed events.

On a 403 or 429 rate limit the poll delay doubles up to 15 minutes, then returns to `poll_seconds`.

## Rules: whose turn

Each ticket is joined with its PR by the ticket key in the PR title. Status words and the texts of the next step come from the workspace's `rules`; the defaults are in `lib/config.mjs`. The first match wins:

1. Open PR has failing checks: your move, "Look at the failing checks".
2. Changes requested: "Address the requested changes".
3. A human commented on your open PR after your last comment there, and it is not an approval: "Read and answer the new comment".
4. Status is one of `statuses.passed`: `passed_next`.
5. Ticket done but PR open: "merge it".
6. PR merged, ticket not done and on you: `merged_next`.
7. Status is one of `statuses.code_review` and the PR is approved: `approved_release_next` for a branch starting with `release_branch_prefix`, otherwise `approved_next`.
8. `statuses.code_review`, not approved: the reviewer's turn. `statuses.qa`: QA's turn. `statuses.on_hold`: their turn, with the reason.
9. On you and nothing above: "Pick it up".
10. `statuses.backlog` and not on you: hidden.

Extra rows, one per item:

- **Ticket comments:** a comment by a human that @-mentions you in the last `history_days` and is not answered. It is a question if it has `?` outside links or one of `question_words`. Otherwise it is "read". Your later comment answers only the people it @-mentions. Authors matching `automation_authors` are ignored.
- **GitHub notifications:** "Review PR #N" while you are still a requested reviewer. "Answer X on #N" until you comment there after the mention.

The On Hold reason is the comment by whoever moved the ticket to On Hold, closest to that moment. If there is none, the last comment before it. As a last resort, the newest comment saying "on hold". Shown on one line, with the full comment in a tooltip and a link.

Handled marks hide a row until something newer happens on it. Desktop notifications fire for new "your move" rows. The first run only records the existing rows.

## API, `127.0.0.1:<port>`

Requests must carry the local `Host`; a POST must be `application/json`. An error is a `google.rpc.Status` envelope: `{"error":{"code","status","message","details":[{"@type":"ErrorInfo","reason"}]}}`; branch on `reason`.

- `GET /api/workspaces`: `[{id, name, key_pattern, connectors:[{id, type, label}], open_moves, theme}]`; `theme` is `{light, dark}`, each a map of CSS variable to value, or `null` without a seed. `/api/summary` leaves `theme` out.
- `GET /api/state?ws=<id>`: one workspace, default the first: `turn` (the rows, each with `group`, `next`, `why`, `url`, `ticket_url`, `source`), `feed`, `marks`, `todos` (each with `ticket_url`), `errors`, `polled_at`, `me` (your name per source), `workspace`, plus `workspaces` and `problems`. With `&full=1` the merged raw collections come too: `tickets`, `comments`, `prs`, `activity`, `asks`, `events`.
- `GET /api/summary`: across all workspaces: `moves` (each with `ws`), `new_events`, `todos`, `polled_at`, `errors`, and `workspaces` with the same per workspace.
- `GET /api/stream`: SSE. One `data:` event per poll per workspace, `{ws, version, polled_at}`. The window reloads state when its workspace's `version` changes.
- `POST /api/marks` takes `{ws?, seen:[ids], base:ms, handled:{row_id: iso|null}, notified:[ids]}`.
- `POST /api/todos` takes `{ws?, action, …}`: `add {text, key?, by?}`; `done`, `undo`, `delete` with `{id}`; `edit {id, text}`.
- `POST /api/refresh` polls now.
- `GET /api/config`: the raw workspace list as written in the config file, the `problems`, the connector catalogue (`type`, `label`, `fields`), the workspace field catalogue (`fields`: workspace, theme, rules, statuses) and the config file path. `POST /api/config` with `{workspaces: [...], secrets?: [{ws, connector, key, value}]}` validates the list first; on a problem it answers `INVALID_CONFIG` with the problems as `BadRequest.field_violations` in `details` and stores nothing. Otherwise it stores the secrets (the account and the store entry come from the connector's own field declaration), writes the file and reloads the workspaces in place; a workspace whose definition did not change keeps its caches, new or changed ones are polled at once. The reply carries the workspace list and `secrets_stored`.
- `POST /api/secrets` with `{service, account, value}` stores a token on its own (Keychain on macOS, a 600-mode file `<data>/secrets/<service>@<account>` elsewhere); it never touches the config.
- Both write endpoints are reachable by any local process. A stored token is bound to its service, account and endpoint: a save that would point an existing token at a new endpoint, account or store entry is refused with `INVALID_CONFIG` unless the same request carries the token again, so a process without the token cannot redirect it. See AGENTS.md.
- Both write endpoints are reachable by any local process. A stored token is bound to its service, account and endpoint: a save that would point an existing token at a new endpoint, account or store entry is refused with `INVALID_CONFIG` unless the same request carries the token again, so a process without the token cannot redirect it. See AGENTS.md.

## The window

- Material 3 plus glass: tonal surfaces seeded from the workspace's `theme.seed`, or one blue without it; translucent blurred islands with 12 px corners, dark and light schemes, a gradient header with stat tiles.
- Under the glass, an animal drawn in dots (`backdrop.js`): one of twelve species, built from shapes whose proportions come from a seeded random. Each workspace gets its own seed for the session, so switching tabs changes the animal; `window.whoseTurnBackdrop.show({ workspace, seed, species })` picks one and `.species` lists the names (the hook for pinning an animal per workspace, RMA-94).
- Two columns. Left: Your move, To do, Waiting on others. Right: the feed. The page never scrolls; each island scrolls inside, with sticky table headers.
- Every header is one line, truncated with an ellipsis. Anything that hides more text gets a "?" icon at the end. Tooltips are Tippy: instant, also on click, interactive, keep line breaks.
- Your move: one row per thing to do, with a "?" for why it is there, an age chip (amber after 24 h) and a Handled button. An Open / Handled switch sits in the header.
- Waiting on others: who holds the ticket and for how long, from the changelog (amber after 3 days). For On Hold, the one-line reason with a tooltip.
- Feed: newest first, one filter button per connector entry, unread items highlighted until clicked plus "Mark all read". Only written things expand. "Open formatted" renders the Markdown safely from DOM nodes, never innerHTML. A "@you" tag marks mentions.
- To do: an input, checkboxes, a "Done N" toggle; ticket keys become links. Claude adds items through the API.
- Status line: live dot, "last check Xs ago", Refresh now, and a banner for source or config errors.
- A rail down the left edge lists the workspaces, like a browser's side tabs: icons only, names on hover. Each icon is generated from the workspace id and tinted by its palette, with the open "your move" count as a badge. The choice is remembered in the browser and `?ws=<id>` opens one directly.
- The gear at the bottom of the rail opens the settings sheet: the workspace list on the left, one workspace's form on the right (id, name, key pattern, theme colours, connector entries with the fields each connector declares, rule texts and status words). Save writes the config file through `/api/config`; a token typed into a secret field goes to `/api/secrets` first and never into the file.

## Claude Code plugin

| part | what it does |
|---|---|
| `hooks/hooks.json` and `bin/session-summary.sh` | at SessionStart, kicks the launch agent if it is down and injects "N your move · M unread · K to-do" plus details into context, marked as data from other people |
| `commands/whose-turn.md` | `/whose-turn` opens the window |
| `skills/whose-turn/SKILL.md` | answers "what's on me" from `/api/summary`, and adds or finishes to-dos through `/api/todos` |
| `bin/statusline.sh` | optional status line, not wired yet |

For development, add this checkout as a local marketplace: `claude plugin marketplace add <path to this folder>`, then install `whose-turn@whose-turn-dev`.

## Developing

- `npm install` once: it points `core.hooksPath` at `.githooks/`.
- `npm run dev` starts the server on port 8766 with data and config in `.users-files/dev/` (gitignored), so nothing touches the real config.
- `npm test` runs the suite. `python3 scripts/docs-check.py` is the docs gate; `/review` is the review gate; both run on push.
- Restart after a code change: `kill $(lsof -tnP -iTCP:8765 -sTCP:LISTEN)` kills whatever listens on the port; the launch agent brings the monitor back.
- The first poll after a restart takes about a minute while the PR cache is rebuilt.
- macOS gotcha: `security add-generic-password … -w` run through a non-interactive shell silently stores an empty password; the server passes the value as an argument, which is why it works from a launch agent.
- A sandboxed agent shell cannot read Keychain. The launch agent can.
