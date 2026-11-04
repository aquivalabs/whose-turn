# 0002 — The window takes browser behaviour from VueUse, except the rail's drag

## Status

Accepted, 2026-11-03. RMA-131. Builds on [0001](0001-vue-window-with-a-build.md); the window is now TypeScript under `npm run check`.

## Context

The window hand-rolled every piece of browser behaviour it needed: storage reads and writes wrapped in try/catch, `matchMedia` listeners for the colour scheme in two modules, a `setInterval` clock, an `EventSource` with its own handlers, resize debounces in two modules, a document keydown listener and a reset timer on the copy button. The `frontend-vue:composables-vueuse` skill and the `meta:reuse-first` ladder put VueUse (rung 3) before our own code. Each candidate was walked down the ladder; the behaviour had to stay identical: the same storage keys and values, the same timings, the same reconnect behaviour of the stream.

## Decision

`@vueuse/core` 15.0.0 is a pinned dev dependency, bundled into `dist/` like Vue. Per candidate:

| Candidate | Decision | Reason |
|---|---|---|
| Island fold, `wt-collapsed` | replace: `useLocalStorage` | One shared JSON list; VueUse syncs every island through the storage event, and the read-modify-write by hand goes away. `writeDefaults: false` keeps storage empty until a fold. |
| Recently done, `wt-recent-open` | replace: `useLocalStorage` with a serializer | The serializer keeps the stored `'1'`/`'0'`, so a choice made before the change still holds. |
| Feed view `wt-feed-view`, last workspace `wt-ws`, window mode `wt-mode` (session) | replace: `useLocalStorage`, `useSessionStorage` | The store's `remembered`/`remember`/`sessionGet`/`sessionSet` helpers are gone; the feed view is a storage ref inside `ui`, so `v-model` writes it. `wt-ws` is still written only on a workspace switch. The keys and values are the ones the window always stored, with `writeDefaults: false`, so nothing is written until a choice is made. |
| Colour scheme | replace: `usePreferredDark` in `web/src/scheme.ts` | One source for the store, the backdrop and the species sheet instead of three `matchMedia` listeners. The `force-dark`/`force-light` class on `<html>` that once won over it was removed in RMA-199: nothing set it. `useMediaQuery` is what `usePreferredDark` wraps; `useDark` was rejected because it writes a class and storage of its own. |
| SSE stream | replace: `useEventSource` | `autoReconnect` is on, so VueUse retries every second until the server is back: Chromium gives up on a refused reconnect, so the browser's own EventSource retry is not enough. A JSON serializer makes every message a new object, so a repeated payload still reaches the watcher; `status` drives the live dot, each `error` sets the "Disconnected…" text, a new `version` reloads the state. |
| Clock | replace: `useNow` with a 30-second `useIntervalFn` scheduler | VueUse 15's default scheduler is every animation frame; the interval keeps the old 30-second tick. |
| Resize debounces (app window size, backdrop) | replace: `useEventListener` with `useDebounceFn` | Same 600 ms and 200 ms waits, with listener cleanup handled. |
| Escape closes the sheets | replace: `onKeyStroke` on `document` | Same target as before. |
| Copy button reset | replace: `refAutoReset` (1600 ms) | Same reset time; the timer no longer outlives a second click. |
| Clipboard write | keep `navigator.clipboard.writeText` | Platform rung: one call; `useClipboard` adds state the button does not use. |
| Rail reorder | keep the HTML drag events | Platform rung, about 25 lines with the before/after drop marker, and the order logic (`movedIds`) is pure and under test. `useDraggable` moves an element by pointer position, not a list order. `useSortable` (SortableJS, about 45 kB) would reorder the DOM itself while the order comes back from the server after the config write, so Vue and SortableJS would both own the same nodes. |
| Reload announcement, `wt-updated-to` in `web/src/lib/page-reload.ts` | keep hand-written `sessionStorage` helpers | VueUse 15 `useSessionStorage` does not guard a browser that blocks storage: its read or write throws. The helpers catch it, so a blocked storage only loses the announcement and the reload still happens. |

## Consequences

Easier: no try/catch storage helpers, one colour-scheme source, listeners that clean up, and the stream state as refs. Harder: VueUse's semantics now sit under the window: a major VueUse upgrade (the `useNow` scheduler change in 15 is an example) has to be read against this table. Impossible: nothing new; the server stays dependency-free, VueUse lives only in the built window.
