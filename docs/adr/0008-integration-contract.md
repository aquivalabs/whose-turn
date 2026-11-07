# 0008. Every source is an adapter under one versioned, capability-declared contract; a user adapter is a module in the adapters folder of the data directory

## Status

accepted (2026-11-07, by the maintainer, with user adapters in one folder of the data directory). Amended 2026-11-07, RMA-429: every adapter is a subclass of `Adapter`; see the amendment under Decision.

## Context

The connector set (GitHub, Jira, Linear, demo) grows by hand, one module per source in `connectors/`, and
users will want Trello, local files, mail, calendars and internal services the maintainer will never
write. The audit in [the integration-contract plan](../plans/integration-contract.md) found that a
contract already exists, implicitly: five named exports and a `poll` that returns six normalised kinds
(`tickets`, `comments`, `prs`, `activity`, `asks`, `runs`), merged by kind and read by four core modules;
no rule or API route imports a connector, and the window branches on a source type in two places only.
Nothing names the contract, versions it or checks what a connector returns.

The options on the table were: an in-process ESM module loaded from a path; an external process over
stdio JSON-RPC (MCP-shaped or our own); an HTTP endpoint the user runs; a declarative "URL plus mapping"
source. And for the data: one contract with declared capabilities, or several contracts per source family.

## Decision

1. **One contract, versioned.** An adapter exports `contract` (an integer, `1` today), `id`, `label`,
   `capabilities` (a non-empty subset of the six kinds), `fields` (the settings-sheet catalogue) and
   `poll(context)`. The shapes of the six kinds are part of the version. Additive changes keep the
   number; a breaking one bumps it and the server speaks both for a release.
2. **Capabilities, not several contracts.** Partial support is a shorter `capabilities` list. An
   undeclared kind in a result is an error; a missing declared kind is an empty list.
3. **Built-in and user adapters go through one mechanism.** The built-ins are the first adapters under
   the contract. A user adapter is an `.mjs` file in the folder `adapters/` of the data directory,
   beside `config.json`, named by its file name in a workspace's connector entry
   (`{ "type": "module", "adapter": "trello" }`), imported, checked at load and polled the same way
   as the built-ins. The built-ins stay in the package's `connectors/`, which an update replaces, so a
   user's files cannot live there; one folder keeps them in one place. The name is a plain file name,
   so a config write cannot point the server at a file outside that folder.
4. **A user module is the user's code and runs with the server's rights.** The server does not claim to
   isolate it. It guards who picks the file and binds a stored token to the adapter's name. An
   out-of-process transport, MCP stdio with one `poll` tool, is reserved for code the user did not
   write, another language, or an adapter that hangs; it is not built until one of those appears.
5. **New data reaches the rules through core kinds.** An adapter maps its data onto the six kinds; a new
   kind is a core change with its shape, facts and default rows, as `runs` was. Adapter-declared facts
   are left for a later ADR.
6. **MCP is not the adapter contract.** It stays the Claude-facing interface and is the candidate wire
   format for the out-of-process transport in 4.
7. **The contract has one page and one check.** `docs/mechanisms/connector-contract.md` is the single
   source, `types/connector.d.ts` its types, `lib/contract.mjs` the run-time check, and a conformance
   command polls an adapter once and shows the rows the default rules make of it.

**Amendment, 2026-11-07 (RMA-429).** Every adapter, built-in or the user's own, is a subclass of the
base class `Adapter` in `lib/adapter.mjs` and is exported as its module's default. The subclass sets
`contract`, `id`, `label`, `capabilities` and `fields` and implements `poll(context)`; the base supplies
the optional parts (`links`, `persistedCache`, `badge`, `tone`) and its own `poll` only refuses, which the
check reports. Why: the maintainer wants all sources on one data bus with one obligatory shape, and a
base class is where a later contract adds a member with a default, so existing adapters keep working; a
change that breaks them raises the contract number instead. The check of a result is unchanged.

## Consequences

- A new source no longer needs a change to the core or a release of the package; an agent can write one
  from the page, check it and connect it.
- The six kinds are shaped by trackers and code review; a source of a different nature maps onto them
  and gets ticket-shaped row texts until a kind of its own is designed.
- A user adapter can read any token the server can. That is accepted for code the user wrote; code from
  elsewhere waits for the out-of-process transport.
- Every built-in must pass the check before it is enforced, so stage 1 runs it in report-only mode first.
- A contract change becomes a documented, versioned event: the page, the types, the check and the
  built-ins move in one PR, and the docs check enforces the page.
- Not possible under this decision without a new ADR: writing back to sources, adapter-declared facts,
  a registry of shared adapters.
