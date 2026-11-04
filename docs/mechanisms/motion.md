# Motion

## What it is

The window's movement: panels fold, rows slide in and out, dialogs fade, all through one set of tokens and the
`motion-v` library, and nothing moves under reduced motion. Why it is `motion-v`, pinned, is
[ADR 0009](../adr/0009-motion-in-the-window.md); this page is how the code does it.

## Where it lives

| File | Role |
|---|---|
| `web/src/styles/tokens.css` | `--motion-fast` 320 ms, `--motion-base` 480 ms, `--motion-slow` 640 ms, `--motion-ease` `cubic-bezier(0.33, 1, 0.68, 1)`; 0 ms under reduced motion |
| `web/src/motion.ts` | the same numbers for JavaScript, the presets `fade`, `rise`, `listed`, the spring, and `glideThrough` |
| `web/src/ui/Island.vue` | a panel: its fold, its floor and its natural height |
| `web/src/ui/Modal.vue` | the dialog: the backdrop and the card |
| `web/src/test-motion.ts` | the stand-in the Vitest tier uses instead of `motion-v` |

## How it behaves

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

A panel never shrinks below its own primary rows: those in its direct row scroller or its to-do list, never a
table nested elsewhere in the body. A row that leaves stays in the DOM for its exit, so the floor sees it until
the exit ends.

### The island's natural height

A child's natural height ignores any room it was stretched into, so the floor never includes the island's own
current height and a panel can shrink again after it grew.

### The dialog

`ui/Modal.vue` fades the backdrop and raises the card with `rise`; the owner wraps it in `AnimatePresence`, so
it leaves the same way.

### The test stand-in

`web/src/test-setup.ts` replaces `motion-v` with `web/src/test-motion.ts`. It renders `Motion` as its plain
tag, drops the animation props (`initial`, `animate`, `exit`, `layout`, `transition`, `whileHover`,
`whilePress`), passes `AnimatePresence` and `MotionConfig` through and resolves `animate` at once, so
behaviour tests never wait for an animation. The tokens and the reduced-motion switch are tested in
`web/src/motion.test.ts`; the real library runs only in the browser build.

## What obliges an update

A change to any file in the table above: a new preset, a changed token, a new way a panel measures itself or
a new animation prop the stand-in must drop.
