# Rules table

## What it is

The rules table decides, for every ticket of a workspace, whose turn it is and what the next step is. It is
an ordered list of rows. Each row has `when`, a set of conditions over facts, and `then`, the outcome. The
first row whose conditions all hold decides the ticket's row in "your move" or "waiting on others". The
plugin ships a default table; a workspace replaces it or places its own rows around it in
`workspaces[].rules.table`. RMA-101.

The table covers ticket rows only. Rows for an open PR whose ticket is not in your list, for GitHub review
requests and mentions, and for unanswered @-mentions in ticket comments are built in code in
`lib/rules.mjs` (`orphanPrRow`, `askRow`, `mentionRow`), as is the feed.

## Where it lives

| File | Role |
|---|---|
| `lib/facts.mjs` | `FACTS`, the closed fact dictionary; `ticketFacts`, which computes one flat facts object per ticket (plus the whole hold reason for the row's link); `statusGroupOrder` and `statusGroups`; `chainGroup`, the row's `status_group` the window tones status pills by; `holdReason` |
| `lib/table.mjs` | Validation (`tableProblems`), the `"default"` marker (`expandTable`), matching (`firstMatch`), placeholders (`fillText`) |
| `lib/default-table.mjs` | `defaultTable(rules)`, the plugin's default rows |
| `lib/rules.mjs` | `compileRules` expands the workspace table and the status-group order once per workspace; `ticketRow` matches the table and applies `then` |
| `lib/config.mjs` | `normaliseRules` validates `rules.table` on load and on `POST /api/config` |
| `lib/api.mjs` | `GET /api/config` returns `facts` (the dictionary) and `tables` (the effective rows per workspace) |
| `web/src/components/SettingsSheet.vue` | Shows the effective rows read-only; `ruleText` in `web/src/lib/settings.ts` turns a row into text |

## How it behaves

### Facts

A fact is a named value computed on the server from the normalized connector output. Connectors return
tickets, PRs and comments; they never compute facts. When a source cannot supply a fact, the fact is
`null`, and a condition on a `null` fact does not match. The list is closed: a new fact is added in
`FACTS` and in `ticketFacts`, never in the config.

| Fact | Type | Comes from |
|---|---|---|
| `connector` | text | the connector entry id the ticket came from |
| `ticket.key` | text | tracker connectors: `jira`, `linear`, `demo` |
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

The PR of a ticket is the one `pickPr` chooses: an open PR over a closed one, then the most recently
updated.

**Status groups.** `ticket.status` is the first group in `rules.statuses` whose words match the status, in
the order `backlog`, `passed`, `code_review`, `qa`, `on_hold`, then any extra group the workspace defines.
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
| `reviewer` | "waiting on others"; shown as `Reviewer` |
| `qa` | "waiting on others"; shown as `QA` |
| `them` | "waiting on others"; shown with the assignee's name |
| `hidden` | in neither list; `next` is optional |

A done ticket whose row is not `you` or `hidden` is in the done group. `next` and `why` are plain text with
`{fact}` placeholders, for example `Answer {comment.author} in the ticket`. A missing fact fills as empty
text.

`rank` is a whole number the window sorts Your move by, lowest first; a row without it keeps 3, and the default table gives failing checks 0, requested changes 1 and work in progress 2. `started: true` marks the row as work in progress. `hold: true` attaches
the link and tooltip of the on-hold reason (`hold_url`, `hold_full`) when the ticket has one.

A ticket that matches no row stays under "waiting on others" with "Not yours now".

### The default table and workspace tables

`defaultTable(rules)` builds the default rows from the workspace's rule texts (`passed_next`,
`merged_next`, `approved_next`, `approved_release_next`, `release_branch_prefix`, `backlog_rows`). Those
`rules` keys keep their meaning. In order:

1. Backlog status, not done, no open PR: hidden; with `backlog_rows: "list"`, `them` with the status name.
2. Open PR with failing checks: you, "Look at the failing checks".
3. Open PR with changes requested: you, "Address the requested changes".
4. Open PR with an unanswered comment: you, "Read and answer the new comment".
5. Passed status: you, `passed_next`.
6. Done ticket with an open PR: you, "Ticket is Done but the PR is open: merge it".
7. Not done, PR merged, on you: you, `merged_next`.
8. Code review status, open approved PR into a branch starting with `release_branch_prefix`: you, `approved_release_next`.
9. Code review status, open approved PR: you, `approved_next`.
10. Code review status: reviewer, "Code review".
11. QA status: them, "QA".
12. On hold with a reason: them, "On hold: {ticket.hold_reason}", `hold`.
13. On hold: them, "On hold".
14. Not done, on you, in progress: you, "Continue the work", `rank` 2, `started`.
15. Not done, on you: you, "Pick it up".
16. Anything else: them, "Not yours now".

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
with `INVALID_CONFIG`, one `field_violations` entry per problem, and nothing is saved. On load, a bad table
is reported in `problems` and the workspace runs on the default table.

Claude edits the table through `POST /api/config` and reads the dictionary and the effective rows from
`GET /api/config` (`facts`, `tables`). The settings sheet only shows the rows.

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
the `"default"` marker or the validation messages, or moves ticket rows into or out of the table.
