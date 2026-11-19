# Storybook

## What it is

A workbench for the window: every component renders on its own page, outside the monitor, with no server and no
real data, in the light and the dark scheme. A design choice is shown there as states of one story before it goes
into the app. The project's choice is recorded in `CLAUDE.md` as `Storybook stories: yes`, the line the
`frontend-vue:storybook-stories` skill reads; the craft lens of the review judges stories by that skill (RMA-475).

## Where it lives

| File | Role |
|---|---|
| `.storybook/main.ts` | finds `web/src/**/stories/*.stories.ts`, Storybook 10 with `@storybook/vue3-vite`, telemetry off |
| `.storybook/preview.ts` | installs i18n and the fake server, pins the scheme from the toolbar's Scheme switch, wraps every story in the app's `LazyMotion` and `MotionConfig` and the `.page`, `.app` and `.dashboard` classes, and hands a component only the args that are its props |
| `.storybook/preview-head.html` | the canvas background and a block-level dashboard, so one island renders alone |
| `web/src/stories/with-snapshot.ts` | the decorator that writes a slice of the server snapshot into the store once, when the story mounts or its controls change |
| `web/src/stories/fake-server.ts` | answers every `/api/*` call in the browser: `/api/marks` by default, a story's own endpoint through `answer(path, handler)`, where the handler gets the body and the method, and every call fails after `goOffline()` |
| `web/src/<folder>/stories/<Component>.stories.ts` and `.mock.ts` | one story per component; its data lives in the mock file |
| `web/src/stories/App.stories.ts` | the whole window from a snapshot |

## How it behaves

### A story owns its state through the store

Islands read the store, not props (ADR 0006). A story's decorator calls `withSnapshot` with a function of the
story's args that returns the slice to write. The write runs in the decorator's `setup`, not in its render, so a
click inside the story does not rerun it and reset what the user opened.

### Controls that are not props stay in the story

A story's controls often pick a state (`state`, `view`, `open`) that the component has no prop for. The preview's
`render` passes the component only the args named in its props, and its `on…` listeners, so a story-only control
never falls through to the root element as an attribute: an `open` control once kept a `<details>` open whatever
the user clicked.

### No call reaches the network

The preview replaces `window.fetch` for `/api/*` before any story renders and resets the routes before each one.
A story whose island writes to the server registers a handler that keeps a local copy, so the buttons work; the
failing state calls `goOffline()` and the island shows its own error. Other URLs pass through untouched.

### The scheme is a toolbar switch

The Scheme switch sets the stored scheme choice through `setScheme` in `web/src/scheme.ts`, and `installScheme`
pins the stylesheets' `prefers-color-scheme` rules to it, as in the app.

## Commands

| Command | What it does |
|---|---|
| `npm run storybook` | the dev server on http://localhost:6006 |
| `npm run build-storybook` | the static build into `storybook-static/` (gitignored); CI runs it in `check.yml`, so a story that does not build fails the pull request |

## What obliges an update

Any change to `.storybook/`, `with-snapshot.ts` or `fake-server.ts` that changes how a story gets its state, what
the server stub answers, or what wraps every story; and a change to how the app itself wraps the window (`App.vue`'s
motion setup, the root classes, the scheme), which the preview has to follow.
