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
| `.storybook/preview.ts` | installs i18n and the fake server, pins the scheme from the toolbar's Scheme switch, resets the story state before each story, wraps every story in the app's `LazyMotion` and `MotionConfig` and the `.page`, `.app` and `.dashboard` classes, sizes it from `parameters.frame`, and hands a component only the args that are its props |
| `.storybook/preview-head.html` | the canvas background, a block-level dashboard so one island renders alone, and the `.storybook-frame` box |
| `web/src/stories/with-state.ts` | `withState`, the one decorator through which a story sets its state, and `resetStory`, which the preview runs before each story |
| `web/src/stories/fake-server.ts` | answers every `/api/*` call in the browser, with default routes and the ones a story adds |
| `web/src/stories/fixtures.ts` | the demo workspace, times relative to now, health, marks and rows that the mock files build from |
| `web/src/<folder>/stories/<Component>.stories.ts` and `.mock.ts` | one story per component; its data lives in the mock file |
| `web/src/stories/App.stories.ts` | the whole window from a snapshot |

## How it behaves

### Every story starts from the same state

The store is a set of module singletons (ADR 0006), so a value one story set would stay for the next. Before each
story the preview's `resetStory` puts `snapshot` and `ui` back as they were when Storybook loaded, with `ui.live`
on, removes the `wt-*` keys from browser storage except the scheme, and resets the fake server.

### A story declares its state

A story's decorator is `withState((args) => state)`. The state is a slice of the server snapshot, a patch of `ui`,
browser storage keys, routes for the fake server or `offline`, and `ui` flags to turn on after mount. The last one
opens a sheet the way a click does: the sheets load when their flag changes, not when they mount with it set. The
state is applied in the decorator's `setup`, not in its render, so a click inside the story does not reapply it.

### Controls that are not props stay in the story

A story's controls often pick a state (`state`, `view`, `open`) that the component has no prop for. The preview's
`render` passes the component only the args named in its props, and its `on…` listeners, so a story-only control
never falls through to the root element as an attribute: an `open` control once kept a `<details>` open whatever
the user clicked.

### No call reaches the network

The preview replaces `window.fetch` for `/api/*`. By default the fake server answers `/api/marks` (read and handled
marks and notes, with the rows' handled flag recomputed), `/api/todos` (add, done, undo, edit and delete on a list
seeded from the snapshot's to-dos) and `/api/changelog` (no versions). A story adds or replaces routes; a handler
gets the body, the method and the URL. With `offline` every call fails and the island shows its own error. Other
URLs pass through untouched.

### Size and wrapper come from parameters

`parameters.frame` (`height`, `width`) puts the story in a flex box with `contain: layout`, so a fixed-position menu
or rail stays inside it. `parameters.chrome: 'none'` drops the preview's `.app` and `.dashboard` wrapper for a
component that brings its own, the whole window and the report page.

### The scheme is a toolbar switch

The Scheme switch sets the stored scheme choice through `setScheme` in `web/src/scheme.ts` when it differs, and
`installScheme` pins the stylesheets' `prefers-color-scheme` rules to it, as in the app.

## Commands

| Command | What it does |
|---|---|
| `npm run storybook` | the dev server on http://localhost:6006 |
| `npm run build-storybook` | the static build into `storybook-static/` (gitignored); CI runs it in `check.yml`, so a story that does not build fails the pull request |

## What obliges an update

Any change to `.storybook/`, `with-state.ts`, `fake-server.ts` or `fixtures.ts` that changes how a story gets its state, what
the server stub answers, or what wraps every story; and a change to how the app itself wraps the window (`App.vue`'s
motion setup, the root classes, the scheme), which the preview has to follow.
