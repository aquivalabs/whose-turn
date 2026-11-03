# 0006 — The window's components sit in layers: ui primitives, one folder per feature, shared composables

## Status

Accepted, 2026-11-03. RMA-182, RMA-195.

## Context

Every component of the window sat in one flat `web/src/components/` folder, 25 files with three tests, and the pure logic in `web/src/lib/`. The folder said nothing about what a component may know: a domain-free primitive such as `Segmented` sat beside the settings sheet, and nothing stopped a primitive from importing the store or one island from importing another. The house rule (`frontend-vue:component-architecture`) is layers with imports going down only: primitives, features, composables and lib, composed by the app and the pages.

The folder names alone would not have made the layers real. Four components wrote state they did not own: `FieldRow` wrote into its parent's object through a prop, `FeedItem` toggled its expanded state and marked itself read in the store, and `Feed` and `Todos` kept their own choices (source filter, view, search, open groups, the done view) in the store's global `ui` object, as did `YourMove` with its open or handled view,, which nothing else read.

Options on the table: keep the flat folder and enforce the rules by review; move the files into layer folders and leave the writes; or move the files and make each layer's contract hold.

## Decision

- `web/src/ui/` holds the primitives, which know nothing of the domain beyond the row types in `lib/types.ts`: `Island`, `Segmented`, `ExtLink`, `AiButton`, `FieldRow`, `MarkdownView`, `RowScroll`, `TicketCell`, `PrCell`. A primitive imports `lib/` and `composables/`, never the store or a feature; props in, events and `defineModel` out.
- `web/src/features/<island>/` holds one folder per island with its components, its composables and its Vitest tests: `your-move`, `todos`, `waiting`, `feed`, `settings`, `feedback`, `report`, `rail`, `header`, `first-run`, plus `status` for the status line and `sheet` for the species sheet. A component used by one parent sits beside it (`RecentlyDone`, `FeedItem`, `SpeciesCell`); the comment modal belongs to the feed. A feature imports `ui/`, `composables/`, `lib/` and the store, never another feature's component; `App.vue` and the page entries `report.ts` and `sheet.ts` compose features.
- `web/src/composables/` holds composables shared by more than one layer (`useFold`); `web/src/lib/` is unchanged and stays under `node:test`.
- Imports across folders go through the `@` alias for `web/src`, registered in `vite.config.mjs`, `vitest.config.ts` and `tsconfig.json`; ESLint already refuses `../../`.
- A leaf never writes shared state. `FieldRow` takes its value through `defineModel` and the settings sheet stores it with `setOrDrop`, so an emptied field still leaves the config. `FeedItem` takes `expanded` and emits `toggle` and `seen`; the feed applies them.
- A feature owns its own choices in a composable of its folder (`features/feed/useFeedState.ts`, `features/todos/useTodosView.ts`, `features/your-move/useMoveView.ts`), kept at module scope so they outlive the island when the first-run card replaces the dashboard. The store's `ui` keeps only what more than one part reads: the workspace, the mode, the live state and status, the open layers, and the expanded feed items, which `switchWorkspace` clears.

## Consequences

Easier: the folder of a component says what it may know, a primitive can be reused without dragging the store along, and a feature's state and tests are found next to it. Harder: a primitive that starts to need the domain has to move up to a feature or take what it needs as props, and a component that gains a second parent moves from a feature folder to `ui/`. Impossible by convention, not by a tool: an island importing another island's component; the checks in `frontend-vue:component-architecture` (a grep for `@/features/` under `features/<feature>/` and `ui/`) are how a review finds one.
