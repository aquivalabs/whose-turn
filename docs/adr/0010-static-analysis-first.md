# 0010 — A rule a tool can check is enforced by the tool; a review lens judges only what no tool can

## Status

Accepted, 2026-11-06. RMA-373. The same principle goes into the house skills in BladeForge as RMA-374.

## Context

The whole-project review of 2026-11-06 (RMA-346) reported, as findings of an LLM lens, rule breaks that a linter catches on every push:

- 15 `if`s without braces. `curly: ['error', 'all']` was in `eslint.config.js`, but `eslint-config-prettier` came after it and switched it off. `--print-config` showed `curly: 0`.
- Local names `el` and `e`. `id-length` listed both as allowed exceptions.
- 667 `px` in the window's styles, against `frontend-css:rem`. No Stylelint rule looked at units.
- Three components styled under a block named after something else: `settings-sheet` in `WorkspaceSettingsSheet.vue`, `monitor-settings` in `MonitorSettingsSheet.vue`, `whats-new` in `WhatsNewSheet.vue`. `selector-class-pattern` checked only the shape of a class.

The review scored the 667 `px` as one minor. An LLM lens reads a diff once, under a budget, and counts a class of break once. A linter reads every line on every push and never gets tired.

## Decision

A rule that a static tool can check is enforced by that tool, and it runs in `npm run check`, so it gates every push. The tools are ESLint, Stylelint, Prettier, `vue-tsc`, `tsc`, and a short script in `scripts/` or `test/` when no linter rule exists. A review lens judges only what no tool can: design, naming that needs meaning, whether a test proves the behaviour, whether a document says the truth.

When a review, a lens or a person finds a class of break that a tool could catch, the fix is the rule first, then the code. A rule the configs name is checked with `--print-config` or `stylelint --print-config` to prove it is really on.

In force from this decision:

- `curly: ['error', 'all']` comes after `eslint-config-prettier`, for the window and the server.
- `id-length` has no `el` or `e` exceptions.
- `stylelint-selector-bem-pattern` 5.0.0, pinned: the first part of every selector in a `.vue` file is the block named after the file, in kebab-case, or the page context (`.app`, `.dashboard`) that places it. `implicitComponents` is `true`, because its glob form crashes in `postcss-bem-linter` (`minimatch is not a function`). The global sheets in `web/src/styles/` hold shared primitives and are exempt.
- Stylelint `unit-disallowed-list` bans `px` except border and outline widths, shadows and filters (RMA-344). Breakpoints are `em`, so the layout switches with the browser's font size, not only with the window's width (RMA-377).

- ESLint `no-restricted-globals` bans `setTimeout` and `setInterval` in `.vue` files, because a component times through VueUse (`useTimeoutFn`, `refAutoReset`, `useIntervalFn`), which clears on unmount.

## Consequences

Easier: a mechanical break goes red on the push that introduces it, with the file and line, and costs no review tokens. A review round spends its budget on judgement.

Harder: a new rule can land only together with the fix of every existing break, or with a ratchet. Renaming a component means renaming its block.

Impossible: a configured rule that is silently off. The `--print-config` check catches a later config that disables it.
