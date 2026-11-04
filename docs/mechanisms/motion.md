# Motion

## What it is

The window's movement: panels fold, rows slide in and out, dialogs fade, all through one set of tokens and the
`motion-v` library, and nothing moves under reduced motion. Why it is `motion-v`, pinned, is
[ADR 0009](../adr/0009-motion-in-the-window.md); this page is how the code does it.

## Where it lives

| File | Role |
|---|---|
| `web/src/styles/tokens.css` | `--motion-fast` 320 ms, `--motion-base` 480 ms, `--motion-slow` 640 ms, `--motion-ease` `cubic-bezier(0.33, 1, 0.68, 1)`; 0 ms under reduced motion |
| `web/src/motion.ts` | the same numbers for JavaScript, the presets `fade`, `rise`, `listed`, `fold`, the spring, `glideThrough` and the `leaving` marker |
| `web/src/motion-features.ts` | the only door to the heavy part of `motion-v` (the feature set and `animate`), imported lazily |
| `web/src/features/your-move/RecentlyDone.vue` | the Recently done block: its fold glides |
| `web/src/ui/Island.vue` | a panel: its fold, its floor and its natural height |
| `web/src/ui/Modal.vue` | the dialog: the backdrop and the card |
| `web/src/test-motion.ts` | the stand-in the Vitest tier uses instead of `motion-v` |

## How it behaves

### The features load on demand

Components are the small `M` of `motion-v` (imported as `Motion`), inside one `LazyMotion` at the app root. The
feature set (`domMax`: exits, layout, gestures) and `animate` are re-exported by `motion-features.ts`, which only
`motion.ts` (`loadFeatures` for the app root, `glideThrough` for `animate`) imports with `import()`, so Vite puts them in their own chunk that loads right after
the entry. `import('motion-v')` itself would not split: the whole package is one namespace. Elements animate once
the chunk is in; until then they sit in their start state for a moment. RMA-314.

### The empty text waits for the list

Waiting on others puts its list and its empty text in one `AnimatePresence` in mode `wait`, keyed `list` and
`empty`, so the list fades out (the wrapper's `island__fade` class) and only then the text appears.

### A group and Recently done fold on the way out

A feed group's children are one `fold` element (height and opacity) in an `AnimatePresence`, so they leave the same
way they came. Recently done is a native `details`; its summary click is intercepted and the open flag flips inside
`glideThrough`, so the block's height glides both ways.

### A fold glides

`glideThrough` runs the change, then tweens the panel's height, or the layout's grid columns for the What
changed strip, from the value it had to the value the stylesheet now gives it, and hands the property back.
The island's observers sleep while it runs and the island is measured once when it ends, because the layout
moves on every frame of a glide.

### The height tween holds the box

`offsetHeight` counts padding and border, so while the height is tweened the element is set to
`box-sizing: border-box` with `flex: none` and no min or max height; a content-box element would be set that
much too tall. The held properties are removed when the tween ends.

### The old value goes back on at once

Before the tween's first frame the stylesheet's new value would otherwise show for one frame, so the old
value is set back immediately and the tween starts from it.

### A folded body is not mounted

A folded panel's body is `v-if`, not `display: none`: a row that mounts under a hidden ancestor never plays
its enter motion and stays invisible after the panel is unfolded. RMA-319.

### The island's floor

A panel never shrinks below its own primary rows: those in its direct row scroller (or the `island__fade` wrapper
around it) or its to-do list, never a table nested elsewhere in the body. A row that leaves stays in the DOM for its
exit, so `AnimatePresence` of the row lists calls `leaving` on it (`data-leaving`) and the floor skips it; the
island measures again when the mark appears.

### The island's natural height

A child's natural height ignores any room it was stretched into, so the floor never includes the island's own
current height and a panel can shrink again after it grew.

### The dialog

`ui/Modal.vue` fades the backdrop and raises the card with `rise`; the owner wraps it in `AnimatePresence`, so
it leaves the same way.

### The test stand-in

`web/src/test-setup.ts` replaces `motion-v` with `web/src/test-motion.ts`. It renders `Motion` (and `M`) as its
plain tag, drops the animation props (`initial`, `animate`, `exit`, `layout`, `transition`, `whileHover`,
`whilePress`), passes `AnimatePresence`, `MotionConfig` and `LazyMotion` through and resolves `animate` at once, so
behaviour tests never wait for an animation. A test that needs to see an exit calls `exits.hold()` before it
renders: `AnimatePresence` then becomes Vue's own `Transition` or `TransitionGroup`, like the real one, and every
exit stays open until `exits.release()`. The tokens and the reduced-motion switch are tested in
`web/src/motion.test.ts`; the real library runs only in the browser build.

## What obliges an update

A change to any file in the table above: a new preset, a changed token, a new way a panel measures itself or
a new animation prop the stand-in must drop.
