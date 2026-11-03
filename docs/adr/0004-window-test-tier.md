# 0004 — The window gets a DOM test tier on Vitest; node:test keeps the server and the pure modules

## Status

Accepted, 2026-11-03. RMA-197, from the RMA-183 code review (C16). Follows the house skill `frontend-vue:testing`.

## Context

The window had no test above `web/src/lib/`. `node:test` has no DOM, so the store and every component were untested, and `web/src/store.ts` could not even be imported under it: the module opened the SSE stream and started a timer as a side effect of being loaded. AGENTS.md had put "pure logic under `node:test`" and nothing for the rest. The house skill expects Vitest, Vue Test Utils and Testing Library for a Vue 3 window.

| Option | Verdict | Reason |
|---|---|---|
| Everything on Vitest, including the server | rejected | The server has no runtime npm dependencies by decision (ADR 0001); its 178 tests run on Node's own runner with nothing to install. Moving them buys nothing and adds a dependency to the half of the project that has none. |
| Stay on `node:test`, test only pure modules | rejected | Leaves the store's write and switch logic and every component behaviour (adding a to-do, marking a row handled) with no test, which is the finding. |
| Two tiers | chosen | Each tier is the cheapest tool that can see what it tests. |

## Decision

Two tiers, one command. `npm test` runs `test/**/*.test.mjs` on `node:test`: the server, `lib/`, `connectors/` and the pure modules of `web/src/lib/`. `npm run test:web` runs `web/**/*.test.ts` on Vitest with `happy-dom`, Vue Test Utils and Testing Library: the store and the components, queried by role and text, with `fetch` stubbed at the boundary. `npm run check` runs both, `node:test` first. Vitest is only for the window; nothing under `test/` moves to it. A module that is only a function of its input stays under `node:test`; a module that needs a DOM or the store goes to Vitest.

To make the store importable, its side effects moved behind `start()` in `web/src/store.ts`: the clock starts, the first load runs and the stream connects. `main.ts` calls it; importing the store does nothing.

## Consequences

Easier: the window's data flow and its islands are testable, a refused write or a late reply is a test, and the review's `frontend-vue:testing` expectation is true. Harder: two runners, two sets of idioms, and `happy-dom` is not a browser, so layout, drag and scroll behaviour stay outside both tiers. Impossible: a store that starts work on import; a test of the real stream needs `start()` and a stubbed `EventSource`.
