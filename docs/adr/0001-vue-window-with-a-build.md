# 0001 — The window is Vue 3 built with Vite; the server stays dependency-free

## Status

Accepted, 2026-11-02. Supersedes the "plain JavaScript without a build step" line of the decisions in AGENTS.md.

## Context

The window started as one hand-rendered `app.js` (784 lines) and one `style.css` with flat class names under a `wt-` prefix. Two defects on the same day came straight from that shape: a new page reused a class the Report button already had (RMA-123), and a panel toggle attached itself to the workspace header because every block with an id looked the same to it (RMA-124). The settings form and the planned rules table (RMA-101) would make that file grow further.

Options on the table: keep plain JavaScript and only adopt a naming rule plus ES modules; Vue 3 with Vite; Svelte; Preact with `htm` and no build; Quasar on top of Vue. React Native was named and dropped at once: this is a local web page served by a Node process, not a mobile app.

## Decision

The window is rewritten in plain Vue 3 single-file components, built with Vite:
- one component per island; the stylesheet ported from the old window stays global for now (`web/src/styles/base.css`, flat `wt-` names) so the look is identical through the migration, and the island rules move into scoped blocks with BEM names as RMA-127; the palette and glass tokens are CSS variables set from `workspace.theme`;
- the window's pure logic lives in `web/src/lib/` and is tested with `node:test`, like the server;
- `npm run build` writes `dist/`, which is gitignored; the server serves `dist/` through `lib/static.mjs` (hashed assets cached by the browser, pages never) and shows a plain notice on an unbuilt checkout while the API keeps working; the old static window is gone;
- the plugin never builds on the user's machine: a tagged release builds `dist/` in CI and publishes the package, and the marketplace plugin installs that published version (RMA-126);
- Quasar is not used: it carries a design system of its own, and the window already has one;
- the server keeps zero runtime dependencies; Vue and Vite are dev dependencies.

## Consequences

Easier: templates instead of hand-built DOM, scoped styles that cannot clash, a place for each island, component boundaries an agent can edit without reading the whole file. Harder: a build step exists for development and release; the plugin's install path now depends on a published artefact instead of files in the repository. Impossible for now: editing the window on a machine without Node and npm.
