# 0013 — The server is plain ESM on Node's built-in modules, with no build step and no runtime dependencies

## Status

Accepted, 2026-11-06, recording a decision in force since the Node decision of 2026-11-02 in AGENTS.md. RMA-367.

## Context

The monitor runs on the user's machine at login, under a launch agent, and is installed by the plugin through npm. Every runtime dependency is code that runs with the user's tokens, needs updates and can break an install. A build step for the server would add a second artefact to keep in step.

## Decision

The server is ESM `.mjs` on Node's built-in `node:` modules: no build step and no runtime npm dependencies. `server.mjs` is the entry, `lib/` the core and `connectors/` one module per source type. Development tools (ESLint, Stylelint, Vitest, Stryker, Vite for the window) are dev dependencies only. The window is the one built part, and CI builds it; see ADR 0001.

## Consequences

Easier: the published package carries only our code and the built window, and an install cannot pull a compromised transitive package. Harder: what a library would give, such as an HTTP client or a scheduler, is written small in `lib/`. Impossible: a runtime `require` of an npm package on the server.
