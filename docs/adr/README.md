# Architecture decision records

## Boundary

An ADR records a decision about how this project's architecture works, and why it was made that way. It is
not a mechanism — how something already works belongs in a live doc under `docs/mechanisms/` — and it is not
a rule this project enforces on itself, which belongs in a skill.

## Shape

Every ADR carries exactly four sections, in this order:

- **Status** — proposed, accepted, superseded, or deprecated.
- **Context** — what forced the decision, and the options that were on the table.
- **Decision** — what was decided, stated plainly.
- **Consequences** — what this decision makes easier, harder, or impossible.

## Update trigger

A new ADR is added when a real architectural decision is made, not for every code change. An existing ADR's
`Status` changes when a later decision supersedes it. The body of an accepted ADR is not rewritten after
acceptance — a decision that no longer holds gets a new record whose `Status` says so, and the old record's
`Status` moves to `superseded`.

## Exclusions

- How a mechanism behaves day to day → a live doc under `docs/mechanisms/`, not an ADR.
- A rule this project enforces on itself → a skill, not an ADR.
- A record that is correct as of a date and never revisited → the frozen layer, if this project has one.

## Acceptance criteria

An ADR is finished when all four sections carry real content in place of this template's starting answers,
its `Status` is set, and it has a row in the index below.

## Filenames

`NNNN-kebab-case-title.md` — a four-digit, zero-padded, sequential number, then a short kebab-case title.
Example shape: `0001-choose-the-message-queue.md`.

## Index

<!-- Add one row per ADR, in number order, linking to the file relatively. -->

| # | Title | Status |
|---|-------|--------|
| 0001 | [The window is Vue 3 built with Vite; the server stays dependency-free](0001-vue-window-with-a-build.md) | accepted |
| 0002 | [The window takes browser behaviour from VueUse, except the rail's drag](0002-vueuse-in-the-window.md) | accepted |
| 0003 | [Comment Markdown stays a hand-written tokeniser behind a DOM builder](0003-markdown-rendering.md) | accepted |
| 0004 | [The window gets a DOM test tier on Vitest; node:test keeps the server and the pure modules](0004-window-test-tier.md) | accepted |
| 0005 | [Each component owns its styles in a scoped BEM block; the global sheet keeps layout and primitives](0005-scoped-bem-styles.md) | accepted |
| 0006 | [The window's components sit in layers: ui primitives, one folder per feature, shared composables](0006-window-layers.md) | accepted |
| 0007 | [A tag publishes the package with the built window inside; the marketplace entry installs that package](0007-release-pipeline.md) | accepted |
| 0008 | [Every source is an adapter under one versioned, capability-declared contract; a user adapter is a module named by path](0008-integration-contract.md) | proposed |
| 0009 | [Motion in the window is motion-v, pinned, through shared tokens, and off under reduced motion](0009-motion-in-the-window.md) | accepted |
| 0010 | [A rule a tool can check is enforced by the tool; a review lens judges only what no tool can](0010-static-analysis-first.md) | accepted |
| 0011 | [Whose turn is decided once, on the server; the window only renders the rows it receives](0011-rules-on-the-server.md) | accepted |
| 0012 | [One tab is one workspace, and nothing is mixed between workspaces](0012-one-tab-one-workspace.md) | accepted |
| 0013 | [The server is plain ESM on Node's built-in modules, with no build step and no runtime dependencies](0013-dependency-free-node-server.md) | accepted |
| 0014 | [The config API trusts every local process, and binds each stored token to its service, account and endpoint](0014-config-api-trusts-local-processes.md) | accepted |
| 0015 | [Defaults cover the common case; everything else is the user's config, explained where it is set](0015-defaults-and-user-config.md) | accepted |
| 0016 | [Window texts live in one catalog through vue-i18n](0016-vue-i18n-for-window-texts.md) | accepted |

## Referencing an ADR from code

At the seam a decision governs, leave a one-line comment pointing at the record it comes from, in whatever
comment syntax the language uses:

```
// See docs/adr/0001-choose-the-message-queue.md
```

Records the code never references go unread.
