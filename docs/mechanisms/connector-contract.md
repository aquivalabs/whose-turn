# Connector contract

## What it is

The connector contract is what a source must be to reach the dashboard: an ES module with six named
exports whose `poll` returns normalised lists of the kinds it declared. The built-in connectors in
`connectors/` and a user's own adapter, an `.mjs` file in the data directory's `adapters/` folder named in a workspace, follow the same contract and go
through the same poll path. Contract version **1**. The decision is
[ADR 0008](../adr/0008-integration-contract.md); the research behind it is
[the integration-contract plan](../plans/integration-contract.md). RMA-95.

**A user adapter runs inside the server with the server's rights**: every token in memory, the secret
store, the file system, the network. Name only a file you wrote or read in full.

The settings sheet offers the built-ins and `module` as **Custom**; `file` is experimental, accepted by
the config but not offered. The built-ins (`github`, `jira`, `linear`) export
`contract` and `capabilities`, and every poll result of theirs is checked: a problem becomes the entry's
partial error `<id>.contract` while its data still flows, so one odd record never empties a source. The
window takes a source's feed badge and icon tone from the connector summary, never from its type.

## Where it lives

| File | Role |
|---|---|
| `lib/adapter.mjs` | `Adapter`, the base class every adapter extends; it supplies `links`, `persistedCache`, `badge` and `tone`, and its `poll` refuses |
| `lib/contract.mjs` | `CONTRACT_VERSION`, `KINDS`, `SHAPES` (the fields and closed values of each kind), `adapterProblems`, `resultProblems`, `ContractError` |
| `types/connector.d.ts` | The same contract as TypeScript types, shipped in the package: `Adapter`, `PollContext`, `PollResult` and one interface per kind |
| `connectors/index.mjs` | `CONNECTORS`, the registry of types; `connectorCatalogue` leaves out a connector that exports `experimental: true` |
| `connectors/module.mjs` | The `module` type: `loadAdapter` imports and checks a user adapter, `pollAdapter` polls it and checks the result |
| `connectors/file.mjs` | The `file` type: tickets from a local Markdown or JSON file; the first connector that exports the contract |
| `scripts/check-adapter.mjs` | The conformance check for an adapter file |
| `lib/workspace.mjs` | `pollSource` calls `poll`, stamps `source`, merges the `KINDS` across entries |

## How it behaves

### Members

An adapter is a subclass of `Adapter`, exported as the module's default (`export default new GitHub()`
for a built-in, a class or an instance for a user adapter). A module in any other shape is refused.
These members are required:

| Member | Type | Meaning |
|---|---|---|
| `contract` | `1` | The contract version the adapter follows |
| `id` | string | 1 to 40 lowercase letters, digits or hyphens, starting with a letter |
| `label` | string | The name the window shows for the source |
| `capabilities` | list | The kinds `poll` may return, a non-empty subset of `tickets`, `comments`, `prs`, `activity`, `asks`, `runs` |
| `fields` | list | `{ key, label, hint?, required?, list?, boolean? }` per setting of the entry; an empty list is fine |
| `poll` | async method | `poll(context)` resolves to the result below; the base's `poll` only throws, and the check refuses an adapter that does not override it |

The base supplies the optional members, which an adapter overrides when it needs them: `links(settings)`
(quick links for the header, none by default), `persistedCache` (cache keys holding `Map`s that survive a
restart), `badge` (the feed badge under the type's own name), `tone` (the feed icon tone, neutral by default; Jira and Linear set `jira`), `experimental` (accepted by the config but not offered in the settings sheet) and `reportable` (a report may name the type; `file` and the user's own sources report as `other`). A built-in
may also set `endpointKey`, the field a stored secret is bound to.

### Context

`poll` receives one object:

| Key | Meaning |
|---|---|
| `settings` | The connector entry from the workspace config: `type`, `id`, the adapter's own fields, and for a module `adapter` |
| `http` | `fetchJson(url, { headers, method, body, useEtag })`: JSON over HTTPS with ETags kept in memory, a 304 served from the cache, `RateLimited` thrown on 429 or a 403 rate limit |
| `cache` | An object kept in memory between polls of this entry; a user adapter's cache is not written to disk |
| `sinceIso`, `historyDays` | The start of the feed window and its length in days |
| `keyOf(text)` | The first ticket key in `text` by the workspace's `key_pattern`, `''` when none |
| `secret()` | A module adapter only: the token stored for this entry, `''` when none |

The built-ins receive `secrets` (the store) instead of `secret()`, and read their own entries.

### Result

`{ me, tickets?, comments?, prs?, activity?, asks?, runs?, ticket_base?, errors? }`.

- `me` is your name in the source, as it appears in `assignee`, `author` and `@` mentions.
- Only declared kinds may appear; a declared kind that is missing counts as an empty list.
- `ticket_base` is the ticket URL without the key, used to link a key found elsewhere.
- `errors` is `{ part: message }` for the parts that failed while the rest succeeded.

Shapes, every field required unless marked optional; a `url` is empty or starts with `https://`, a time
is an ISO date-time:

| Kind | Fields |
|---|---|
| `tickets` | `key`, `summary`, `status`, `status_category` (`new`, `indeterminate`, `done`), `assignee`, `updated` (time), `url`, `status_change` (optional, `{ since, by }` or `null`) |
| `comments` | `id` (string or number), `key` (the ticket's), `at` (time), `author`, `body`, `url` |
| `prs` | `pr` (number), `key`, `title`, `base`, `state` (`OPEN`, `CLOSED`, `MERGED`), `review` (`''`, `APPROVED`, `CHANGES_REQUESTED`), `checks` (`passing`, `failing`, `running`, `none`), `merged_at`, `updated_at` (time), `url`, `last_comment_by`, `last_comment_at`, `last_comment_url`, `last_comment`, `unanswered` (boolean) |
| `activity` | `at` (time), `pr` (the feed reference), `key`, `title` (optional), `kind`, `who`, `url`, `text`, `body` (optional) |
| `asks` | `id`, `ref`, `title`, `key`, `kind` (`review requested`, `mentioned you`), `who`, `at` (time), `url`, `text`, `body` |
| `runs` | `id`, `ref` (stable per pipeline), `workflow`, `branch`, `failed`, `mine` (booleans), `actor`, `title`, `url`, `at` (time), `streak` (the first failure's id) |

The server stamps every item with the entry's id as `source` and merges the kinds of all entries of a
workspace. Facts for the rules are computed from these shapes, never by an adapter
([rules table](rules-table.md)). A source of another nature maps onto these kinds: a to-do is a ticket, a
request addressed to you is an ask.

### Errors

- Throw for a total failure: the message becomes the entry's error in the window and in
  `/api/summary`, and counts toward the failing-source health alert. Name the thing to fix; never put a
  token in a message.
- Return `errors: { part: message }` for a partial failure; the server prefixes the part with the
  entry id.
- Throw `RateLimited` (from `lib/http-client.mjs`) to make the server back off.
- A module that is not a connector, or a result that breaks the shapes, is a `ContractError`: its
  message is `Adapter <path> does not follow connector contract 1:` followed by every problem, at most
  ten, separated by `; `.

### The `module` type

A workspace entry `{ "type": "module", "id": "board", "adapter": "trello", "board": "…" }` runs
`adapters/trello.mjs` from the data directory, beside `config.json`. The `module` type is itself an
`Adapter` (`CustomSource` in `connectors/module.mjs`): its `poll` loads the named adapter and polls it
through `pollAdapter`, which refuses a result that breaks the contract.

- In the settings sheet, **+ Add Custom source** asks for a **Name** (the entry's `label`). On save an
  entry without `adapter` gets the name made from its label, in Latin, lowercase, words joined by `_`,
  at most 40 characters (`adapterNameOf`), and a missing file gets a template that extends `Adapter`
  with an empty `poll`; the monitor never overwrites an existing file. The label reaches the template only
  as the `label` string literal, written with `JSON.stringify`; the header comment is fixed text, so no
  label can close it and become code. The user or Claude writes the
  source into that file.
- `GET /api/config` carries `adapters`: per adapter a `module` entry of the config names, its `label`
  and `fields`, or the `problem` that stops it loading; a file in the folder that no entry names is
  never imported, so its code never runs; the sheet shows those fields on the entry's card and the problem
  under its Name.

- `adapter` is the file name without `.mjs`: lowercase letters, digits, `-` and `_`. Any other value,
  a path among them, is the entry's error, so no config can point outside the folder.
- The file's default export must be a subclass of `Adapter` imported from `./_whose-turn.mjs`, which the
  monitor writes into the folder at every start; a file that does not extend it is refused.
- Saving a config loads every `module` entry's adapter; a missing or broken one refuses the save with a
  violation at that entry's `adapter` field, and nothing is written.

- The file is imported at the entry's first poll and again when its modification time changes; the
  check runs on every import. A failed check is the entry's error, and the next poll tries again.
- The adapter's own required fields must be present in the entry, or the poll fails naming them.
- The token is optional, entered like any connector secret and stored under the service
  `token_service` (default `whose-turn-adapter`) and the account `adapter`; the field declares `followsEndpoint`, so the redirect guard of ADR 0014 skips it. The name is both the account
  and the endpoint, so another name looks up another token: a stored token never follows a renamed
  entry, and a save does not ask for the token again.
- Old module instances stay in memory after a re-import; ESM has no unload.

### The `file` type

A workspace entry `{ "type": "file", "path": "~/notes/tasks.md", "me": "alex" }` supplies `tickets`.

- **Markdown**: every `- [ ]` and `- [x]` item is a ticket. The nearest `##` (or deeper) heading above
  an open item is its status; before any heading it is `To Do`. `[x]` is `Done`. `@name` in the item
  assigns it to `name`, else it is yours (`me`, default `me`). A key in the text matching the
  workspace's `key_pattern` is the ticket key; otherwise the key is `F-` and six hex digits of the title.
- **JSON** (`.json`): a list, or `{ "tickets": [...] }`, of `{ summary | title, key?, status?, assignee?,
  updated?, url?, done? }`. A `url` that is not `https://` is dropped.
- Statuses `Done`, `Closed`, `Complete(d)` are `done`; `Backlog`, `To Do`, `Todo`, `Open`, `New` are
  `new`; any other is `indeterminate`. The workspace's `rules.statuses` then group them as for any
  tracker.
- An item keeps the time it was first seen in its current text, status and assignee (`seen`, persisted),
  so saving the file moves only the items that changed.

### Template

`adapters/trello.mjs` in the data directory:

```js
/** Trello cards assigned to you on one board. */
import { Adapter } from './_whose-turn.mjs';

export default class Trello extends Adapter {
  contract = 1;
  id = 'trello';
  label = 'Trello';
  capabilities = ['tickets'];
  fields = [
    { key: 'board', label: 'Board id', required: true },
    { key: 'me', label: 'Your full name on Trello', required: true },
  ];

  async poll({ settings, http, secret }) {
    const [key, token] = (await secret()).split(':');
    if (!token) {
      throw new Error('Store the token as "<api key>:<token>" for this entry');
    }
    const auth = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
    const cards = await http.fetchJson(`https://api.trello.com/1/boards/${settings.board}/cards?members=true&list=true&${auth}`);
    const mine = cards.filter((card) => card.members.some((member) => member.fullName === settings.me));
    return {
      me: settings.me,
      tickets: mine.map((card) => ({
        key: card.idShort ? `TR-${card.idShort}` : card.id, summary: card.name, status: card.list?.name || 'Open',
        status_category: card.closed || card.dueComplete ? 'done' : 'indeterminate',
        assignee: settings.me, updated: card.dateLastActivity, url: card.shortUrl,
      })),
    };
  }
}
```

The Trello calls are a sketch to be checked against Trello's API reference; the shape of the result is the part this page fixes. `_whose-turn.mjs` is written into the folder by the monitor at every start and re-exports its `Adapter`, so the import resolves after every update. The fixture `test/fixtures/adapters/board.mjs` is a complete adapter that needs no network.

### Conformance check

```
node scripts/check-adapter.mjs <adapter.mjs> [--settings '{"board":"…"}'] [--no-poll]
```

It imports the file, checks the exports, runs one poll with the server's HTTP client and the token from
`WHOSE_TURN_ADAPTER_TOKEN`, checks the result and prints the rows the default rules make of it. Exit 0
passes, 1 is a contract or poll problem with one line per problem on stderr, 2 is a usage error. It
accepts a built-in too, and every built-in passes.

The package ships the script and this page, so an installed monitor has them at
`<data>/app/node_modules/whose-turn/scripts/check-adapter.mjs` and
`<data>/app/node_modules/whose-turn/docs/mechanisms/connector-contract.md`, where `<data>` is the folder
of `config_file` in `GET /api/config`.

### Versioning

`contract` is an integer; this server speaks `1`. An additive change (a new optional field, a new kind,
a new context helper) keeps the number and is listed here with its date. A breaking change bumps it,
and the server speaks the old version alongside the new one for at least one release. An adapter with a
version the server does not speak is refused with both numbers in the message.

## What obliges an update

Any change to a file in the table above that adds, renames or removes an export, a context key, a kind,
a field of a kind or one of its closed values, changes a check or its messages, changes how a module is
loaded, reloaded or given its token, changes how the `file` connector reads a file, or changes the
contract version.
