# Whose Turn

A local monitor that answers "what is waiting on me right now" across the places your work arrives: GitHub pull requests, Jira and Linear tickets, and your own to-dos. It polls each source about once a minute, decides once, on the server, whose turn every ticket is, shows the result in a window that updates live, sends a desktop notification when something becomes your move, and hands any item to an AI assistant as Markdown with its context. Its Claude Code plugin, `whose-turn@bladeforge`, makes a session start with "N your move · M unread · K to-do" already in context.

[![Whose Turn in 80 seconds: the noise of many trackers, then one queue of your moves](docs/media/whose-turn-film.png)](docs/media/whose-turn-film.mp4)

The film, 80 seconds with sound: [docs/media/whose-turn-film.mp4](docs/media/whose-turn-film.mp4). Its first act is staged; the window in the second act shows the maintainer's real workspaces on 3 November 2026.

![The window with invented data: Your move, To do, Waiting on others, and the feed](docs/window.png)

Everything runs on your machine: a Node 22 server on `127.0.0.1`, a window built with Vue, and no account anywhere but the sources you already use. Nothing that names an employer, an account or a team process lives in this repository; it all sits in one config file on the machine that owns it.

## Install

You need Node 22 or newer and, for GitHub, the `gh` CLI signed in.

```sh
git clone https://github.com/aquivalabs/whose-turn && cd whose-turn
npm ci && npm run build
./install.sh && ./open.sh
```

`install.sh` makes the monitor start at login and restart if it stops (a launch agent on macOS, a systemd user unit on Linux; on Windows it prints the one `schtasks` line to run). `open.sh` opens the window as its own app window, or in a browser tab with `--browser`. The window listens on port 8765; `WHOSE_TURN_PORT` changes that. A clone updates with `git pull` and a rebuild; it is never offered the in-app update.

With Claude Code, the plugin installs and starts all of this for you, with no clone and no build (see [Claude Code](#claude-code)). That install updates itself: the server checks npm every ten minutes, tells you about a new version with a desktop notification and a chip in the status bar, and installs it and restarts on one click (`POST /api/update`).

```sh
claude plugin marketplace add aquivalabs/BladeForge
claude plugin install whose-turn@bladeforge
```

## First run

The window opens on one card: add a source through the settings sheet (the gear at the bottom of the rail). A source needs an account and its filters; a token typed into a secret field goes to the platform's secret store, never into the config file. Claude can set a workspace up too, through the `whose_turn_config` MCP tool. From then on the server polls, the window follows, and the Claude Code plugin reads the same server.

## Workspaces and connectors

A **workspace** is one place you work: a project, a client, a side venture. It has its own connectors, its own feed and its own to-dos; nothing is mixed between workspaces. A **connector** is the code for one source type (`connectors/github.mjs`, `connectors/jira.mjs`): it takes one connector entry of a workspace (an account and its filters) and returns normalised `tickets`, `comments`, `prs`, `activity`, `asks` and `runs`, plus `me` (your name there) and, for a ticket source, `ticket_base`. It holds no rules and knows no employer. The server stamps every row with the entry's id as `source`, merges all entries by kind and runs the rules over the merged view, so a workspace may hold two entries of one type (two repositories, two Jira sites) when each carries its own `id`.

Nothing that names an employer, an account or a team process lives in this repository. It all sits in one file on the machine that owns it:

| platform | config file |
|---|---|
| macOS | `~/Library/Application Support/whose-turn/config.json` |
| Linux | `$XDG_CONFIG_HOME/whose-turn/config.json`, default `~/.config/whose-turn/config.json` |
| Windows | `%APPDATA%\whose-turn\config.json` |

`WHOSE_TURN_DATA` overrides the whole directory, `WHOSE_TURN_CONFIG` the config file alone, `WHOSE_TURN_PORT` the port (it wins over `port` in the config file; `install.sh` and the plugin read both the same way). On first run there is no file: the settings sheet (the gear) or Claude through `/api/config` writes it, or copy `config.example.json` there and fill in:

| key | meaning |
|---|---|
| `port`, `poll_seconds`, `history_days` | the port, how often to poll, how far back the feed reaches |
| `stale_minutes`, `failing_polls` | health alerts: no data from any source for this many minutes (default 15), or one source failing this many polls in a row (default 3) |
| `feedback.workspace`, `team`, `project` | where the "to the backlog" button and the `whose_turn_feedback` MCP tool file bugs and improvements about the monitor: a Linear workspace slug, team key and project name; the key with issue-creation rights goes to the secret store under `feedback.token_service` (default `whose-turn-feedback`) and the workspace slug |
| `feedback.assign` | `false` leaves a filed issue unassigned for triage; by default it is assigned to the owner of the feedback key, so it shows up on that person's own dashboard |
| `feedback.composer` | the user's own agent that turns a remark into an issue: `{command, args}` of a CLI that reads the prompt on stdin and prints JSON (`{title, kind, body}`, or a wrapper with a `result` string that contains it); default `claude -p --output-format json --model claude-haiku-5-5`, so Claude Code on the user's subscription; `codex exec` or anything alike works the same way |
| `feedback.bug_words` | extra words, in any language, that make the fallback composer (used when the agent CLI gives no usable answer) call a remark a bug; matched as stems at a word start; the English defaults bug, broken, crash, error, fail, wrong always apply |
| `workspaces[].id`, `name` | a short id used in the API and on disk (lowercase letters, digits and hyphens, up to 40, starting with a letter or digit; a missing id becomes `ws<n>`) and the display name |
| `workspaces[].key_pattern` | regex for ticket keys in PR titles and to-dos; the default matches any Jira-style key; a pattern that does not compile is refused on save |
| `workspaces[].connectors` | an object keyed by type, or a list of `{type, id?, label?, …}` entries when one type appears twice |
| `…connectors.github.repo` | the repository whose PRs are yours, `owner/name` |
| `…github.org` | notifications are kept only from this org; defaults to the repo owner |
| `…github.me` | your GitHub login; left empty, it is asked from the API once |
| `…github.account` | which `gh` account's token to use when several are logged in |
| `…github.bots` | logins whose comments never count as a human reply |
| `…github.workflow_runs` | `false` stops watching the Actions runs on the default branch; on by default |
| `…connectors.jira.base` | your Jira Cloud site, `https://` only |
| `…jira.email` | the account the API token belongs to |
| `…jira.token_service` | the secret-store entry holding the token, default `whose-turn-jira` |
| `…jira.jql` | which tickets to watch |
| `workspaces[].links` | quick links shown in the header, as `"Label https://…"` strings or `{label, url}`; the repository, the Jira site and the Linear team come from the connectors by themselves, unless one of these links already points at the same site |
| `workspaces[].rules` | the team's process, see Rules below; `statuses` groups, `automation_authors` and `question_words` must be lists of strings (statuses non-empty) or the save is refused |
| `…connectors.linear.workspace`, `team`, `project` | the Linear workspace slug (the part after linear.app/), and optionally one team key or one project name; the personal API key goes to the secret store under the workspace slug |
| `workspaces[].theme.seed` | optional hex colour, `#rrggbb`; the window derives its light and dark Material 3 scheme from it (`lib/palette.mjs`); without it the stylesheet's blue stays |
| `workspaces[].theme.accent` | optional second hex that sets the tertiary hue; defaults to the seed's hue turned by 80 degrees |

A flat config with `github`, `jira` and `rules` at the top level still loads as one workspace named `default`.

Secrets never go into the config. GitHub uses `gh auth token`, or `GH_TOKEN` from the environment when set. The Jira API token lives in the platform's secret store under the service and the account email: the macOS Keychain, libsecret on Linux (`secret-tool`), or the Windows Credential Manager (through `lib/platform/credential.ps1`). Paste it into the settings sheet or send it through the API, and the server stores it. When the store is missing or refuses (no `secret-tool`, a launch agent refused Keychain access), the server keeps it in `<data>/secrets/<service>@<account>` with mode 600. On macOS `security` receives the value as a command-line argument, which other local processes can see for a moment; libsecret and the Windows script read it from stdin.

State lives next to the config, per workspace: `workspaces/<id>/state.json` (last poll), `marks.json` (read, handled, notified), `todos.json`, `cache.json` (fetched PR details, so a restart does not refetch them; versioned, never holds a token).

## Platforms

| platform | autostart | secrets | notifications | status |
|---|---|---|---|---|
| macOS | launchd agent, `install.sh` | Keychain | `osascript` | in daily use |
| Linux | systemd user unit, `install.sh` | libsecret, else file | `notify-send` | scripts and argv tested with stubs; not run on a real machine |
| Windows | Task Scheduler, one `schtasks` line that `install.sh` prints | Credential Manager, else file | PowerShell balloon | untested on Windows |

On Windows, run `schtasks /Create /SC ONLOGON /TN whose-turn /TR "\"<path to node.exe>\" \"<this folder>\server.mjs\""` once; `install.sh` prints the same line and installs nothing. The notification is a `NotifyIcon` balloon shown by `powershell`, which Windows 10 and 11 display as a toast; title and body reach it through environment variables, not through the script text.

## Files

| file | role |
|---|---|
| `server.mjs` | entry: config, the poll loop with rate-limit backoff, the API |
| `lib/config.mjs` | data directory, defaults, the workspace list |
| `lib/workspace.mjs` | one workspace: polls its connectors, merges results, derives events, evaluates rules, notifies |
| `lib/rules.mjs` | the "whose turn" rules and the feed |
| `lib/palette.mjs` | a workspace's light and dark scheme from its theme seed |
| `lib/api.mjs` | the local HTTP API, SSE stream and static files |
| `lib/window.mjs` | the app window's remembered size and the launcher behind "Open as app" |
| `lib/http-client.mjs`, `lib/secrets.mjs` (with `lib/platform/credential.ps1`), `lib/notify.mjs`, `lib/store.mjs`, `lib/errors.mjs`, `lib/text.mjs` | ETag fetch, secret lookup, desktop notification, files on disk, the error envelope, text helpers |
| `connectors/` | one module per source type |
| `web/` | the window: a Vue 3 app in TypeScript built with Vite (`web/src/App.vue`, primitives in `web/src/ui/`, one folder per island in `web/src/features/` with its components, composables and tests, shared composables in `web/src/composables/` (ADR 0006), each component's styles in a scoped BEM block (layout and shared primitives in `web/src/styles/base.css`, ADR 0005), pure logic in `web/src/lib/`, the dot-drawn animal in `web/src/backdrop.ts`, Tippy.js 6.3.7 and Popper 2.11.8 pinned in `web/public/vendor/`); `npm run build` writes `dist/`, which the server serves and git ignores (ADR 0001) |
| `install.sh` | bash installer that picks by `uname`: on macOS the launch agent `local.whose-turn` (log in `~/Library/Logs/whose-turn.log`); on Linux the user unit `~/.config/systemd/user/whose-turn.service` (log in `journalctl --user -u whose-turn`); both start at login and restart on a crash; on other systems it prints the Windows `schtasks` line. The agent runs `launch.sh`, which resolves node at every start (login shell, then PATH, then the path `command -v node` found at install time, kept as `WHOSE_TURN_NODE`), so removing a version-manager Node does not break it; `WHOSE_TURN_DATA` and `WHOSE_TURN_PORT`, when set in the shell that runs it, are written into the plist or the unit and named in the "Installed" line |
| `open.sh` | opens the window as its own app window (Chrome on macOS; Chrome, Chromium or Edge on Linux) at the size it last had, or in a browser tab with `--browser` or when none of those is installed; bash, not zsh, so it runs on Linux too; Windows: open the URL yourself |
| `test/` | `node:test` suite: rules, config, ADF conversion |

## Sources and polling

**GitHub**, token from `gh auth token`, or from `GH_TOKEN` when that variable is set (CI, a machine without `gh`):

- `search/issues` finds your open PRs and PRs updated in the last `history_days`. Full details are fetched only for PRs whose `updated_at` changed: PR, reviews, issue comments, inline comments, check runs.
- Open PRs get their check runs re-polled every cycle, because CI finishing does not bump `updated_at`.
- Workflow runs: one `GET /repos/{owner}/{repo}/actions/runs?branch=<default branch>` per poll (the default branch itself is asked once a day) finds runs that fail on the default branch after a merge, on a schedule or in a `workflow_run` chain; each failure and the success that ends it reach the feed as `check failed` and `check passed`, runs of pull requests are left to the PR path, and `workflow_runs: false` on the connector turns this off.
- `/notifications?participating=true` gives review requests and @-mentions on PRs and issues that are not yours, filtered to the org.
- Every GET carries an ETag; a 304 does not count against the 5000/h limit. Steady state is about 1 to 10 requests a minute per workspace.
- The token is sent only to `https://api.github.com/`.

**Linear**, GraphQL with a personal API key: two queries per poll, your open issues and your issues completed in the last 30 days, optionally one team or one project, with up to 50 comments and the state history of each; the moment an issue entered its current state comes from that history. Mentions in comments become `@Name`.

**Jira Cloud REST**, email plus API token, Basic auth:

- `POST /rest/api/3/search/jql` with the workspace's JQL. Fields: summary, status, assignee, updated, comment. All comments are kept. Comment bodies arrive as ADF and are turned into Markdown-ish text: mentions become `@Name`, media becomes `[image]`.
- `GET /rest/api/3/issue/{key}/changelog` for each open ticket tells when and by whom it entered its current status. Cached until the ticket's `updated` changes.
- Status and assignee changes between polls become feed events.

On a 403 or 429 rate limit the poll delay doubles up to 15 minutes, then returns to `poll_seconds`.

## Rules: whose turn

Each ticket is joined with its PR by the ticket key in the PR title. The server computes a set of facts per ticket (`pr.checks`, `ticket.status`, `ticket.assignee`, `unanswered_count` and the rest, listed by `GET /api/config` under `facts`) and walks the workspace's rules table: the first row whose conditions hold decides whose turn it is and the next step. The full contract is in [docs/mechanisms/rules-table.md](docs/mechanisms/rules-table.md).

The default table, in `lib/default-table.mjs`, takes its status words and next-step texts from the workspace's `rules` (defaults in `lib/config.mjs`). In order:

1. Open PR has failing checks: your move, "Look at the failing checks".
2. Changes requested: "Address the requested changes".
3. A human commented on your open PR after your last comment there, and it is not an approval: "Read and answer the new comment".
4. Status is one of `statuses.passed`: `passed_next`.
5. Ticket done but PR open: "merge it".
6. PR merged, ticket not done and on you: `merged_next`.
7. Status is one of `statuses.code_review` and the PR is approved: `approved_release_next` for a branch starting with `release_branch_prefix`, otherwise `approved_next`.
8. `statuses.code_review`, not approved: the reviewer's turn. `statuses.qa`: QA's turn. `statuses.on_hold`: their turn, with the reason.
9. On you, in an in-progress status and nothing above: "Continue the work".
10. On you and nothing above: "Pick it up".
11. `statuses.backlog` without an open PR: hidden, whoever it is on; with `backlog_rows: "list"` it is shown under Waiting on others instead, which turns that panel into a plain task list for a project you run alone. This row is checked first.
12. A workflow run on the default branch whose latest completed run failed, on a commit you pushed or a run you started: your move, "Look at the failed run of <workflow> on <branch>", rank 0, until a later run of the same workflow passes; someone else's failed run stays in the feed only (facts `run.failed`, `run.workflow`, `run.branch`, `run.mine`). These rows are checked before the backlog row.

A workspace sets its own rows in `rules.table`. The list replaces the default table; the text `"default"` in it stands for the default rows at that spot. A condition is a value, a list of values, a number comparison (`gt`, `gte`, `lt`, `lte`) or a `prefix`; `whose` is `you`, `reviewer`, `qa`, `them` or `hidden`; `next` and `why` may quote facts as `{fact}`:

```json
"rules": {
  "table": [
    { "when": { "unanswered_count": { "gte": 2 } }, "then": { "whose": "you", "next": "Answer {comment.author} and the others on {ticket.key}" } },
    { "when": { "pr.open": true, "pr.base": { "prefix": "release/" }, "pr.checks": ["running", "none"] }, "then": { "whose": "them", "next": "Wait for the release checks on PR #{pr.number}" } },
    "default"
  ]
}
```

Claude edits the table through `POST /api/config`, which refuses a table with an unknown fact or operator and names the row. The settings sheet lists the rows in force, read-only.

Every row carries a numeric `rank` from its table row's `then.rank`, lowest first: 0 failing checks, 1 requested changes, 2 work in progress, 3 everything else. Your move sorts by `rank`, then oldest first; the window never reads the next-step text to order rows. Under the table, a folded Recently done list shows the last 15 tickets that are done, most recently done first.

Extra rows, one per item:

- **Ticket comments:** a comment by a human that @-mentions you in the last `history_days` and is not answered. It is a question if it has `?` outside links or one of `question_words`. Otherwise it is "read". Your later comment answers only the people it @-mentions. Authors matching `automation_authors` are ignored.
- **GitHub notifications:** "Review PR #N" while you are still a requested reviewer. "Answer X on #N" until you comment there after the mention.

The On Hold reason is the comment by whoever moved the ticket to On Hold, closest to that moment. If there is none, the last comment before it. As a last resort, the newest comment saying "on hold". Shown on one line, with the full comment in a tooltip and a link.

A handled row leaves the Open list and shows under Handled, marked, until something newer happens on it; after seven days the mark expires and the row comes back if it is still open. The server decides this once: it sets `handled` on every row and counts the open moves from the same rule for the window's tiles and badge, `/api/summary` and the notifications. Desktop notifications fire for new "your move" rows. The first run only records the existing rows.

The monitor also alerts on its own polling: stale data, or a source that keeps failing. "Data age" is the time since the last poll in which at least one source answered, so a poll where every source failed does not refresh it; a workspace with no sources is never stale. A timer checks it every 30 seconds, independent of the poll loop, so a hung poll is noticed too. A tick that arrives after a gap, because the machine was asleep, only asks for a poll and leaves the verdict to the next tick, so waking up does not raise a false alert. A source counts as failed in a poll when it returned any error, including a partial one; the streak is kept in `state.json` and resets on the first poll without errors. Each new alert (`stale`, or `failing:<source>`) sends one desktop notification and is remembered in `marks.json`, so a restart does not repeat it; a growing streak bumps the state version so an open window re-reads the count; when the last alert clears, one "recovered" notification follows. The state is `health` in `/api/summary` and `/api/state`, in the SessionStart summary as "Monitor health", and in the window banner and status line.

## API, `127.0.0.1:<port>`

Requests must carry the local `Host`; a POST must be `application/json`. An error is a `google.rpc.Status` envelope: `{"error":{"code","status","message","details":[{"@type":"ErrorInfo","reason"}]}}`; branch on `reason`. The reasons: `NOT_FOUND` (unknown path, 404), `METHOD_NOT_ALLOWED` (405 with an `Allow: GET, POST` header, a method other than GET or POST), `NO_SUCH_WORKSPACE`, `NO_SUCH_TODO` (404), `NO_WORKSPACE` (412, a request that needs a workspace while none is configured; `/api/state` still answers 200 with an empty snapshot carrying `problems`, which the first-run card reads), `NOT_CONFIGURED` (412, feedback is not set up), `UPSTREAM_FAILED` (502, Linear failed or answered an error; the HTTP status is in the `ErrorInfo` metadata `upstream_status`), `RATE_LIMITED` (429), `UNKNOWN_ACTION`, `INVALID_BODY`, `INVALID_ARGUMENT` (an empty to-do or remark names the field `text` in a `BadRequest` detail), `INVALID_CONFIG` (400), `UPDATE_IN_PROGRESS` (409, an update is already installing), `UPDATE_UNAVAILABLE` (412, nothing to update: a checkout, or already the latest version), `FORBIDDEN_ORIGIN` (403) and `INTERNAL` (500, a fixed message; the raw exception text appears only in a `DebugInfo` detail when the server runs with `WHOSE_TURN_DEBUG=1`, and always in the server log).

- `GET /api/workspaces`: `[{id, name, key_pattern, connectors:[{id, type, label}], open_moves, theme}]`; `theme` is `{light, dark}`, each a map of CSS variable to value, or `null` without a seed. `/api/summary` leaves `theme` out.
- `GET /api/state?ws=<id>`: one workspace, default the first: `turn` (the rows, each with `group` (`you`, `others`, `done`, or `gone` for a row the workspace's rules hide, which is never your move), `rank`, `next`, `why`, `url`, `ticket_url`, `source`, `status_group` (`backlog`, `passed`, `code_review`, `qa`, `on_hold` or empty) and `handled`), `counts` (`mine`, `others`, `failing`, `done`: the four header tiles), `feed`, `marks`, `todos` (each with `ticket_url`), `errors`, `health`, `polled_at`, `me` (your name per source), `workspace`, plus `workspaces` and `problems`. With `&full=1` the merged raw collections come too: `tickets`, `comments`, `prs`, `activity`, `asks`, `events`.
- `GET /api/summary`: across all workspaces: `moves` (each with `ws`), `new_events`, `todos`, `polled_at`, `errors`, `health` (`{ok, alerts}`, alerts as text prefixed with the workspace name when there are several), and `workspaces` with the same per workspace, where `health` is `{ok, stale, fresh_at, failing:[{source, polls}], alerts:[{id, text}]}`.
- `GET /api/stream`: SSE. One `data:` event per poll per workspace, `{ws, version, polled_at, open_moves}`. The window reloads state when its workspace's `version` changes. The update status arrives as `{update}`, once on connect and on every change.
- `/api/summary` and `/api/state` carry `update: {current, latest, available, state, reason?}`. The server checks `https://registry.npmjs.org/-/package/whose-turn/dist-tags` every ten minutes (ETag-cached) and follows the `latest` dist-tag, which every publish moves (prereleases included during the alpha); `available` is true when that tag names another version and the server runs from the plugin's install, `<data>/app/node_modules/whose-turn`. `state` is `idle`, `installing`, `restarting` or `failed` (with npm's last lines in `reason`). A new version raises one desktop notification. `POST /api/update` runs `npm install --prefix <data>/app --no-audit --no-fund --no-save whose-turn@<version>` and restarts: under the launch agent it exits and the agent starts the new copy; without one it frees the port, starts the new `server.mjs` detached (output to `<data>/server.log`) and exits. A failed install leaves the running copy as it was. A second `POST` while one runs is refused with `UPDATE_IN_PROGRESS`; one with nothing to update with `UPDATE_UNAVAILABLE`. This is the expected, announced way an install stays current, not a silent update.
- A read without `ws` answers for the first workspace; a write (`/api/marks`, `/api/todos`, an inbox hand-off) without `ws` is refused with `INVALID_ARGUMENT`, because it would land silently in the wrong workspace (RMA-115).
- `POST /api/marks` takes `{ws, seen:[ids], unseen:[ids], base:ms, handled:{row_id: iso|null}, notified:[ids]}`; `seen` and `unseen` must be strings (`unseen` takes ids back out of `seen`, which is how Undo restores Mark all read), `base` a number not in the future, `handled` values ISO dates or null, else `INVALID_ARGUMENT` names the field. It answers `{marks, turn, counts}`, recomputed, so the window updates without a reload.
- `POST /api/todos` takes `{ws, action, …}`: `add {text, key?, by?}`; `done`, `undo`, `delete` with `{id}`; `edit {id, text}`.
- `POST /api/refresh` polls now.
- `GET /api/window` is the size the app window last reported, `{width, height}`, or `{}` before the first report; `POST /api/window` with `{width, height}` (whole pixels, 300 to 10000) stores it in `<data>/window.json`. `open.sh` reads it for `--window-size`.
- `POST /api/open` with `{mode: 'app' | 'browser'}` runs `open.sh` (with `--browser` for `browser`) on the machine the server runs on, with `WHOSE_TURN_PORT` set to this server's port; this is what the window's "Open as app" button calls. A second open of the same mode within 5 seconds is refused with `429` and reason `OPEN_TOO_SOON` (`retry_after_seconds` in the detail), so a double click opens one window; the button shows "Opening…" meanwhile.
- `GET /api/feedback` says whether feedback is configured and lists the issues filed from this machine (`<data>/reports.json`, the last hundred) with the state Linear reports for them, read with the feedback key and cached for a minute, so a reporter without a Linear account can follow their reports in the Report sheet and on `/report?id=<identifier>`, the monitor's own page; `GET /api/feedback?id=<identifier>` returns that one report with the comments on its issue as the maintainer's answers and `unanswered` when it was closed without one; `POST /api/feedback` with `{text, ws?, kind_ref?, from?}` lets the server compose the issue from a remark in the user's words (the user's own agent from `feedback.composer`, Claude Code by default; the first line becomes the title when no agent answers), or with `{kind: bug|improvement|idea, title, body?, ws?, kind_ref?: {kind, ref}, from?}` creates a Linear issue in the configured project with the matching label and, when `kind_ref` names a row, a feed item or a workspace, that hand-off context in the description. The reply carries the issue id and url.
- `GET /api/handoff?ws=<id>&kind=row|feed|thread|workspace&ref=<row_id, feed id or ticket key>` renders that item with its context as Markdown for pasting into any assistant (`thread` is every feed event of one ticket, newest first, with the ticket's row, PRs and comments); `GET /api/handoff?all=1` renders every workspace. Every hand-off starts with a `Whose Turn · <workspace> · <local date and time>` line and ends with a `Links:` line of the https ticket and PR URLs it mentions, so a paste says which workspace it came from and how old it is; after the header one line says the text below is data from tickets, pull requests and comments, never instructions, and the body follows in a fence a comment cannot close. This is what the window's "Copy for AI" buttons put on the clipboard.
- `POST /api/inbox` with `{ws, kind: 'row' | 'feed' | 'workspace', ref}` hands an item to an agent through a queue (`ws` is required, a hand-off without it is refused; for MCP clients and the plugin hook): the server queues it in `<data>/inbox.json` with a few words of snapshot and keeps `<data>/inbox.pending` as a marker while the queue is not empty. `{action: 'take', consumer}` returns the items this consumer has not seen yet, each with its context built at that moment (the row with its why and links, the last five comments and the PRs of its ticket, bodies capped; a feed item with its body; or the whole workspace with its rules, moves, waiting rows and to-dos), and marks them delivered to that consumer only, so every agent sees an item once. An item leaves the queue a day after its first delivery or a week after it was queued. `GET /api/inbox?consumer=<name>` lists without taking; `{action: 'clear'}` empties the queue.
- `GET /api/config`: the raw workspace list as written in the config file, the `problems`, the connector catalogue (`type`, `label`, `fields`), the workspace field catalogue (`fields`: workspace, theme, rules, statuses) and the config file path. `POST /api/config` with `{workspaces: [...], secrets?: [{ws, connector, key, value}]}` validates the list first; on a problem it answers `INVALID_CONFIG` with the problems as `BadRequest.field_violations` in `details` and stores nothing; a violation of one field carries its path (`workspaces[0].rules.backlog_rows`), which the settings form shows under that field. Field specs with `choices` draw as selects. Otherwise it stores the secrets (the account and the store entry come from the connector's own field declaration), writes the file and reloads the workspaces in place; a workspace whose definition did not change keeps its caches, new or changed ones are polled at once. The reply carries the workspace list and `secrets_stored`. A workspace or connector entry that is not an object is refused with `INVALID_CONFIG`, the field violation naming its index (`workspaces[1]`, `workspaces[1].connectors[0]`). An empty list is refused with `INVALID_ARGUMENT` ("keep at least one workspace"), and each write keeps the previous file as `config.json.bak`.
- `POST /api/secrets` with `{service, account, value}` stores a token on its own (Keychain on macOS, a 600-mode file `<data>/secrets/<service>@<account>` elsewhere); it never touches the config.
- Both write endpoints are reachable by any local process. A stored token is bound to its service, account and endpoint: a save that would point an existing token at a new endpoint, account or store entry is refused with `INVALID_CONFIG` unless the same request carries the token again, so a process without the token cannot redirect it. See AGENTS.md.

## The window

Open it at `http://127.0.0.1:<port>/` (or with `open.sh` as an app window). One tab per workspace sits in the rail down the left edge; hover an icon for its name, the badge counts what is waiting on you there.

**What is on me.** The Your move panel lists one row per thing to do: the ticket, the next step, the PR and the last comment that matter. A small "why" next to the step says how the rule reached it, and a chip says how long it has waited (amber once it is more than a day). Columns that are empty in every row are left out. A PR without a ticket shows the PR once, as the link in the first column.

**Mark it handled.** "Handled" moves a row out of the list; the Handled view lists them, dimmed, with Undo. A handled row comes back after seven days if it is still open, or sooner when something new happens on it. Recently done, folded under the list, shows the tickets that left your move lately.

**What I wait for.** Waiting on others lists tickets you touched where someone else holds the next step, with who and for how long. To do holds your own notes; Claude can add to it too.

**What changed.** The feed on the right is newest first, grouped by ticket. A ticket that is your move has an amber bar. Unread items are lit until you click them, and "Mark all read" clears them (with Undo). Search filters by any words and opens the matching groups; the source buttons narrow it to one source, "Flat" drops the grouping. Only written things expand, and "Open formatted" shows the comment as it was written.

**Fold, resize, copy, ask.** Every panel folds with the chevron before its title and stays folded. Drag a panel's edge to resize it (arrow keys work on the focused handle, double click resets); the size is kept per workspace and never goes below the header and one full row. The AI button on a row, a ticket thread, a workspace or the top bar copies that context as Markdown for any assistant.

**Add a source.** First run shows one card with "Add a source". Later, the gear at the bottom of the rail opens Settings: the workspaces on the left, one workspace on the right with its sources, rule texts and colours. Save writes the config; a token goes to the secret store and never into the file. A failing source gets one line in the red banner above the panels, which opens Settings.

**Report a problem or a wish.** "Report" in the top bar takes one text field; Send files it in the monitor's own backlog and shows the link, and `/report?id=<issue>` shows the answer.

**Keys.** `/` focuses the feed search, `t` the to-do field, Escape closes a sheet, Alt+Up and Alt+Down move a focused rail icon, drag also reorders. The window follows the system's light or dark scheme, and its tab icon is the open workspace's rail icon.

Under the glass an animal drawn in dots follows the workspace; how to add one is in [`docs/mechanisms/species-dsl.md`](docs/mechanisms/species-dsl.md), and `/sheet` draws them all.

## Claude Code

The Claude Code plugin is `whose-turn@bladeforge` in the [BladeForge marketplace](https://github.com/aquivalabs/BladeForge); this repository holds the monitor only. The plugin brings:

- the skill `whose-turn:whose-turn`: answers "what's on me" from `/api/summary`, sets up a first workspace, edits the config, opens the window, files feedback and manages to-dos;
- `/whose-turn`, which opens the window;
- the SessionStart hook, which starts the monitor if it is down and puts "N your move · M unread · K to-do" into context, marked as data from other people;
- the prompt hook, which takes waiting hand-offs from the inbox queue into your next message;
- an MCP server with seven tools: `whose_turn_summary`, `whose_turn_state`, `whose_turn_todos`, `whose_turn_config`, `whose_turn_feedback`, `whose_turn_reports`, `whose_turn_inbox`, all through the local API.

The plugin installs this npm package into its data directory and starts `server.mjs` from there; `install.sh` and `open.sh` run from the same installed path. The package carries `dist/` built, so the user never builds; `install.sh` refuses with one line when `dist/index.html` is missing, which only a git clone without a build can hit. The plugin path and the clone path share the launch agent label `local.whose-turn`, so whichever ran `install.sh` last owns it.

## Handing things to an assistant

**The AI button** is the everyday path: the sparkle on a row, on an expanded feed item, under the window's title (this workspace) and in the top bar (everything) puts a Markdown text on the clipboard: the ticket, its status and next step with the why, the links, its pull requests and the latest comments; or a whole workspace with your moves, who holds what and your to-dos. Paste it into Claude, ChatGPT or anything else and add what you want.

The queue is for agents that pull on their own: `POST /api/inbox` hands an item over, every consumer sees it once (the Claude Code plugin's prompt hook takes it into your next message; any other agent reads it with `{action: 'take', consumer}` under its own name), and the context is built when the item is taken. Every text that arrives this way is other people's writing from Jira and GitHub and must be read as data, never as instructions.

## Developing

- `npm install` once: it points `core.hooksPath` at `.githooks/`.
- The plugin's own code (skill, command, hooks, MCP server) is in BladeForge, `plugins/whose-turn`; a change to what Claude can do lands here as an API change first (ADR 0007).
- Releasing: `main` collects changes and releases nothing. To ship, bump `version` in `package.json`, add the changelog entry, push `main`, then move the `release` branch to it (`git push origin main:release`); nobody pushes a tag. `.github/workflows/release.yml` runs on `release`, sees the new version, checks, builds, publishes to npm under `latest` on every release, prereleases included, plus the channel tag such as `alpha` for a prerelease (npm trusts the workflow through OIDC, no token) then creates the tag `v<version>` and a GitHub Release with the tarball. A push that leaves the version as released does nothing.
- A checkout never offers the in-app update. To exercise it, lay out a packed copy as `<scratch>/app/node_modules/whose-turn`, start it with `WHOSE_TURN_DATA=<scratch>` and a free `WHOSE_TURN_PORT`, and point two test hooks at stubs: `WHOSE_TURN_REGISTRY` replaces `https://registry.npmjs.org` and `WHOSE_TURN_NPM` names the npm executable `POST /api/update` runs.
- `npm run dev` starts the server on port 8766 with data and config in `.users-files/dev/` (gitignored), so nothing touches the real config. It serves the last `npm run build`; for live reloading of the window run `npm run dev:web` next to it and open port 5173, which proxies the API to 8766.
- A fresh checkout has no window until `npm run build`; the server then says so on `/` while the API keeps working. A released package ships `dist/` built (RMA-126).
- `npm test` runs the suite (Node strips the types of the `web/src/lib/*.ts` modules it imports). `npm run test:web` runs the window's store and component tests on Vitest. `npm run check` runs `vue-tsc` and `tsc` over the server, ESLint over the window and the server, Stylelint and both suites (CI runs it on every pull request and push to `main`), `npm run format` runs Prettier over `web/src`; with `node scripts/docs-check.mjs` (the docs gate) and `/review` (the review gate) it runs on push.
- Restart after a code change: `kill $(lsof -tnP -iTCP:8765 -sTCP:LISTEN)` kills whatever listens on the port; the launch agent brings the monitor back.
- The first poll after a restart takes about a minute while the PR cache is rebuilt.
- macOS gotcha: `security add-generic-password … -w` run through a non-interactive shell silently stores an empty password; the server passes the value as an argument, which is why it works from a launch agent.
- A sandboxed agent shell cannot read Keychain. The launch agent can.
