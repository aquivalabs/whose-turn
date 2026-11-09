# Rules table

## What it is

The rules table decides, for every ticket of a workspace, whose turn it is and what the next step is. It is
an ordered list of rows. Each row has `when`, a set of conditions over facts, and `then`, the outcome. The
first row whose conditions all hold decides the ticket's row in "your move" or "waiting on others". The
plugin ships a default table; a workspace replaces it or places its own rows around it in
`workspaces[].rules.table`. RMA-101.

The table decides ticket rows and workflow run rows. A run row stands for a GitHub Actions workflow whose
latest completed run on the repository's default branch failed (RMA-152); the connector returns it in
`runs` only while it fails, so a later success removes the row. Its facts are the `run.*` facts and
`connector`; every ticket and PR fact is missing, so ticket rows never match a run and run rows never match
a ticket. The row is keyed by repository, workflow and branch (`key` is `<repo>:<workflow>@<branch>`, the
same text as the feed item's `ref`), its `url` is the run, and its `row_id` adds the id of the first
failure of the streak, so a new breakage after a fix is a new move and notifies again.

Rows for an open PR whose ticket is not in your list, for GitHub review
requests and mentions, and for unanswered @-mentions in ticket comments are built in code in
`lib/rules.mjs` (`orphanPrRow`, `askRow`, `mentionRow`), as is the feed. A review request or mention
without a ticket key says "this PR" in its next step, since the PR's own key already stands in the
ticket column. A ticket a connector marks `mention_only` (Jira, a ticket whose comment mentions you though it
was never yours, RMA-86) gives its mention rows and no ticket row, no `touched` feed item and no ticket event; mention rows are built from ticket rows only, each row carrying its own mention-only flag. A ticket change that no comment or event explains is a feed item of kind `touched`
with the text `now <status>, with <who>`.

## Where it lives

| File | Role |
|---|---|
| `lib/facts.mjs` | `FACTS`, the closed fact dictionary, each fact with its plain words (`name`, and `says` for a boolean); `ticketFacts`, which computes one flat facts object per ticket (plus the whole hold reason for the row's link); `runFacts`, the facts of one failing workflow run; `statusGroupOrder` and `statusGroups`; `chainGroup`, the row's `status_group` the window tones status pills by; `holdReason` |
| `lib/table.mjs` | Validation (`tableProblems`, its object check is `isObject` from `lib/text.mjs`, shared with the config), the `"default"` marker (`expandTable`), matching (`firstMatch`), placeholders (`fillText`) |
| `lib/default-table.mjs` | `defaultTable(rules)`, the plugin's default rows |
| `lib/rules.mjs` | `compileRules` expands the workspace table and the status-group order once per workspace; `ticketRow` and `runRow` match the table and apply `then` |
| `lib/config.mjs` | `normaliseRules` validates `rules.table` on load and on `POST /api/config` |
| `lib/api.mjs` | `GET /api/config` returns `facts` (the dictionary) and `tables` (the effective rows per workspace) |
| `web/src/features/settings/WorkspaceSettingsSheet.vue` | Shows the workspace's effective rows read-only; `ruleText` in `web/src/lib/settings.ts` turns a row into a sentence, reading fact names and flag sentences from the `facts` the server sends ("When the ticket is in review and the PR is open and the PR is approved: your move, \"Merge it\"") |

## How it behaves

### Facts

A fact is a named value computed on the server from the normalized connector output. Connectors return
tickets, PRs and comments; they never compute facts. When a source cannot supply a fact, the fact is
`null`, and a condition on a `null` fact does not match. The list is closed: a new fact is added in
`FACTS` and in `ticketFacts`, never in the config.

Each `FACTS` entry holds the fact's type, its closed values when it has any, where it comes from, and the plain
words the window reads it with: `name` for the noun, `says` for a boolean's true and false sentence.

| Fact | Type | Comes from |
|---|---|---|
| `connector` | text | the connector entry id the ticket came from |
| `ticket.key` | text | tracker connectors: `jira`, `linear` |
| `ticket.status` | text, a status group | the status matched against `rules.statuses` |
| `ticket.status_name` | text | the status as the tracker names it |
| `ticket.assignee` | text | `me` when the ticket is on you, else the assignee's name |
| `ticket.done` | boolean | the status category is done |
| `ticket.started` | boolean | the status category is in progress |
| `ticket.hold_reason` | text | the comment that explains an `on_hold` status (`holdReason`); `null` when no comment does |
| `pr.open`, `pr.merged` | boolean | `github`; `false` when the ticket has no PR |
| `pr.number` | number | `github` |
| `pr.checks` | `passing`, `failing`, `running`, `none` | `github` |
| `pr.review` | `approved`, `changes_requested`, `none` | `github` |
| `pr.base` | text | `github`: the branch the PR goes into |
| `pr.unanswered` | boolean | `github`: a human commented after your last comment, and it is not an approval |
| `pr.commenter` | text | `github`: the author of that comment |
| `comment.mentions_me` | boolean | tracker comments: an unanswered @-mention of you on the ticket |
| `comment.is_question` | boolean | the newest unanswered mention reads as a question (`question_words`) |
| `comment.author` | text | the author of the newest unanswered mention |
| `unanswered_count` | number | how many @-mentions of you on the ticket are unanswered |
| `run.failed` | boolean | `github`: the latest completed run of a workflow on the default branch failed; `null` on tickets |
| `run.workflow` | text | `github`: the workflow's name |
| `run.branch` | text | `github`: the branch it ran on, the default branch |
| `run.mine` | boolean | `github`: you pushed the commit or started the run (the run's `actor` or `triggering_actor` is your login) |

The PR of a ticket is the one `pickPr` chooses: an open PR over a closed one, then the most recently
updated.

**Status groups.** `ticket.status` is the first group in `rules.statuses` whose words match the status, in
the order `backlog`, `passed`, `code_review`, `qa`, `release`, `on_hold`, then any extra group the workspace defines.
A status that matches no group falls back to its category: `todo`, `in_progress` or `done`. A workspace can
add a group, for example `"statuses": { "design": ["in design"] }`, and test `ticket.status: "design"`.

### Conditions

| Form | Matches when |
|---|---|
| `{ "pr.checks": "failing" }` | the fact equals the value |
| `{ "ticket.status": ["qa", "on_hold"] }` | the fact equals one of the values |
| `{ "unanswered_count": { "gte": 2, "lt": 5 } }` | every comparison holds (`gt`, `gte`, `lt`, `lte`, numbers only) |
| `{ "pr.base": { "prefix": "release/" } }` | the text fact starts with the value |
| `{ "ticket.hold_reason": { "present": true } }` | the fact is not `null`; `false` matches a missing fact, the one condition that does |

A row with an empty `when` matches every ticket. There are no expressions, scripts or regexes.

### Outcome

`then` is `{ whose, next, why?, rank?, started?, hold? }`:

| `whose` | Row |
|---|---|
| `you` | "your move"; shown as `You` |
| `reviewer` | "waiting on others"; shown as the list of every reviewer of the ticket's open PR, else `Reviewer`: requested ones (people and teams) as plain names, then reviewers by their latest review, `✓ name` approved, `✗ name` changes requested, a comment-only review a bare name only while they have no later state, dismissed reviews ignored, your own login and the author left out. The row also carries `reviewers` (`name`, `state` of `''`, `approved`, `changes`) for the window; the names go through `youOr` |
| `qa` | "waiting on others"; shown as `QA` |
| `release` | "waiting on others"; shown as `Release` |
| `them` | "waiting on others"; shown with the assignee's name |
| `hidden` | in neither list; `next` is optional |

A done ticket whose row is not `you` or `hidden` is in the done group. `next` and `why` are plain text with
`{fact}` placeholders, for example `Answer {comment.author} in the ticket`. A missing fact fills as empty
text.

`rank` is a whole number the window sorts Your move by, lowest first; a row without it keeps 3, and the default table gives a failed run and failing checks 0, requested changes 1 and work in progress 2. `started: true` marks the row as work in progress. `hold: true` attaches
the link and tooltip of the on-hold reason (`hold_url`, `hold_full`) when the ticket has one.

A ticket that matches no row stays under "waiting on others" with "Not yours now".

A row that leaves "your move" for "others" in a poll gets an automatic Handled mark (`auto: true` in `marks.info`, see `lib/trace.mjs`), so the trace stays where the user looks. It applies to ticket rows only, and its `outcome` comes from the ticket events that poll recorded: `Merged` when the PR just merged, else `Passed to <name>` (with ` · <status>` when the status moved too), else `Moved to <status>`; `event` is the feed id of that event, and `detail` keeps the assignee and status changes and, when a comment came in the day before the move, the feed id of that comment (`detail.comment`; the window reads the author and full text from the feed when the modal opens, and shows only the outcome line once the comment has aged out), with a short excerpt appended to `outcome`. Marks saved before this kept a copy `{author, text}` there, and the window still renders it. A move with no such event leaves no mark. A row that comes back to you loses the mark; marks expire after seven days. A Handled mark may also carry a one-line `note`, which the feed shows as the user's own `note` event on the ticket.

Every ticket row carries `labels`, the label names of its ticket and of its PR once each, and `badges`, the ones named in the workspace's `rules.highlight_labels` (matched without regard to case); `labels` lists the badges first. Connectors pass label names as the tracker gives them; empty names and repeats are dropped here, in one place. A PR row without a ticket takes its PR's labels. The labels play no part in `whose`; the table decides without them (RMA-434).

A ticket on hold that is assigned to you waits on others, and its `With` cell reads `on hold` and not `you`: the hold is the reason it is not yours now (RMA-449).

The user's own name is shown as `you` wherever a person appears: the `With` cell, feed items and comment authors (`youOr` in `lib/rules.mjs`), including the names in a reassignment event; the Handled trace reads that feed text instead of mapping names itself.

### The default table and workspace tables

`defaultTable(rules)` builds the default rows from the workspace's rule texts (`passed_next`,
`merged_next`, `approved_next`, `approved_release_next`, `release_branch_prefix`, `backlog_rows`). Those
`rules` keys keep their meaning. In order:

1. Failed workflow run that is yours: you, "Look at the failed run of {run.workflow} on {run.branch}", `rank` 0.
2. Any other failed workflow run: hidden; it stays in the feed.
3. Backlog status, not done, no open PR: hidden; with `backlog_rows: "list"`, `them` with the status name.
4. Open PR with failing checks: you, "Look at the failing checks".
5. Open PR with changes requested: you, "Address the requested changes".
6. Open PR with an unanswered comment: you, "Read and answer the new comment".
7. Passed status: you, `passed_next`.
8. Done ticket with an open PR: you, "Ticket is Done but the PR is open: merge it".
9. Not done, PR merged, on you: you, `merged_next`.
10. Code review status, open approved PR into a branch starting with `release_branch_prefix`: you, `approved_release_next`.
11. Code review status, open approved PR: you, `approved_next`.
12. Code review status: reviewer, "Code review".
13. Testing status (`qa`): them, "Testing".
14. Release status (`release`: ready for release, ready to release, awaiting release): `release`, "the next release". The PR rows above come first, so a pending PR step still wins.
15. On hold with a reason: them, "On hold: {ticket.hold_reason}", `hold`.
16. On hold: them, "On hold".
17. Not done, on you, started: you, "Continue the work", `rank` 2, `started`; the why says "no pull request is waiting on anyone".
18. Not done, on you: you, "Pick it up"; same why ending.
19. Anything else: them, "Not yours now".

`workspaces[].rules.table` is a list of rows. Without it the default table applies. With it, the list
replaces the default. The text `"default"` placed anywhere in the list stands for the default rows at that
spot; that one key covers replacing the default and extending it on either side:

```json
"rules": {
  "table": [
    { "when": { "pr.open": true, "pr.base": { "prefix": "release/" }, "pr.checks": ["running", "none"] },
      "then": { "whose": "them", "next": "Wait for the release checks on PR #{pr.number}" } },
    "default"
  ]
}
```

### Validation

`normaliseRules` in `lib/config.mjs` runs `tableProblems` over `rules.table`. Each problem names the
workspace and the 1-based row: an unknown fact, an unknown operator, a value of the wrong type or outside a
closed list (status groups included), an unknown `whose`, a missing `next`, a `started` or `hold` that is not a boolean, an unknown key, an unknown
`{fact}` in a text, or `"default"` used twice. On `POST /api/config` any problem refuses the whole write
with `INVALID_CONFIG`, one `field_violations` entry per problem, and nothing is saved; a problem of one field (id, key pattern, `backlog_rows`, a connector field with `choices`) names its path, such as `workspaces[0].rules.backlog_rows`. On load, a bad table
is reported in `problems` and the workspace runs on the default table.

A valid table can still be a mistake, so `tableWarnings` adds two warnings that never refuse a write: the
table hides every ticket (its first catch-all row, an empty `when`, is `hidden` and nothing before it
shows), or a catch-all row precedes other rows, which then never apply. On load they are appended to
`problems`; `GET /api/config` returns them per workspace as `table_warnings`, and the workspace settings sheet shows
them above the rows.

Claude edits the table through `POST /api/config` and reads the dictionary and the effective rows from
`GET /api/config` (`facts`, `tables`). The workspace settings sheet only shows the rows.

### Custom rules module (not implemented)

Level 3 of RMA-101 is not built: it waits for the custom-connector loading of RMA-95. The contract it would
follow:

- A file `<data>/rules/<name>.mjs`, loaded the way RMA-95 loads custom connectors, named by a workspace with
  `rules.module: "<name>"`.
- It exports `decide(facts, context)`. `facts` is the facts object above; `context` holds the ticket, its PR
  and its comments as the connectors returned them.
- It returns `{ whose, next, why? }` in the shape of a table `then`, or `null`.
- It is called only when the table's first match is a row with an empty `when` (the catch-all) or there is
  no match. A non-null answer replaces the catch-all's answer; `null` keeps it.
- Its answer goes through the same check as a table `then`. A module that throws or returns a bad shape is
  reported in `problems`, and the table's answer stands.

### Not covered

Rules over history between polls, such as "checks failed three times today", need an event memory that the
facts do not have. That is a separate layer.

## What obliges an update

Any change to `lib/facts.mjs`, `lib/table.mjs`, `lib/default-table.mjs` or `lib/rules.mjs` that adds, renames
or removes a fact, a condition form, a `whose` value or a default row, changes the status-group order,
the `"default"` marker or the validation messages, or moves ticket rows or workflow run rows into or out of the table.

### Words in the window

The `qa` group is called Testing everywhere a person reads it: the Testing statuses field, the settings rows ("the ticket is in testing") and the default next step. The `rules` fields are labelled by the situation they answer ("Next step when the PR is approved"). The ids (`qa`, `approved_next`) stay as they are in the config and the API.

The plain words of a fact live in `FACTS` (`name`, and `says` for a boolean), so a fact added on the server reads in words in the window without a window change; a fact without them falls back to its dotted name with the dots turned into spaces. Status groups and the `pr.review` values keep their phrases in the window.
