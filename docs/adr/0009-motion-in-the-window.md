# 0009 — Motion in the window is motion-v, pinned, through shared tokens, and off under reduced motion

## Status

Accepted, 2026-11-04. RMA-313. Builds on [0002](0002-vueuse-in-the-window.md): `@vueuse/core` is already the window's source of browser behaviour and is the peer `motion-v` asks for.

## Context

The window changed state by jumping: a panel folded in one frame, a handled row vanished, a dialog appeared at full strength, a banner popped in. The `frontend-vue:motion` skill ranks the tools: a CSS transition on a class, Vue `Transition` and `TransitionGroup`, the View Transitions API, then a motion library. What the window needs sits past the second rung:

- **Exit animations** on elements that a `v-if` or a `v-for` removes: a row, a banner, a dialog. `Transition` can do it one element at a time, but not inside a table body or beside a list whose neighbours must close the gap.
- **List reorder and layout**: rows that glide to their new place when the rows around them come, go or reorder, in tables where only `tbody` and `tr` are valid children.
- **Springs** for that movement, and one interpolation engine for a fold that tweens a computed height or grid columns.

Candidates:

| Candidate | Verdict |
|---|---|
| CSS and Vue `Transition`/`TransitionGroup` only | Rejected: no layout animation, and a `TransitionGroup` renders a wrapper tag a table body cannot have. |
| `@vueuse/motion` | Rejected: no release since March 2025. |
| `@formkit/auto-animate` | Rejected: lists only; no dialogs, folds or springs. |
| `motion-v` (Motion for Vue, the official port of Motion) | Chosen: `AnimatePresence` for exits, `layout` for reorder, springs, `MotionConfig` for the reduced-motion switch, components that render as any tag (`as="tbody"`), maintained weekly. |

## Decision

The window's motion is `motion-v`, pinned exactly to `2.9.0` in `package.json` (a dev dependency, bundled into `dist/` like Vue; the newest release is days old and not yet trusted). No other animation library is added; a CSS transition on a class remains right for a hover or a chevron.

- **One set of tokens.** `web/src/styles/tokens.css` holds `--motion-fast` 150 ms, `--motion-base` 200 ms, `--motion-slow` 250 ms and `--motion-ease` `cubic-bezier(0.2, 0, 0, 1)`. `web/src/motion.ts` mirrors them for JavaScript, with the presets components bind: `fade` (chips, banners, notices, dots), `rise` (a dialog card), `listed` (rows of short lists: a slide in and out, plus the layout glide), and `glideThrough` (a fold tweens the panel's height, or the layout's grid columns for the What changed strip, from the old value to the one the stylesheet gives it). A test keeps the two sides equal.
- **Reduced motion is instant, not gentler.** Under `prefers-reduced-motion: reduce` the CSS durations are 0 ms and every JavaScript preset has `duration: 0`; the app root also sets `MotionConfig` to `reducedMotion="user"` and `skipAnimations`, because `reducedMotion="user"` alone keeps opacity animating.
- **The rule.** Every element that appears, disappears or changes state animates through these tokens and honours reduced motion; a change that adds such an element without motion is incomplete (AGENTS.md, Decisions in force).
- **Owners wrap, components animate.** A component that is shown or hidden with `v-if` or `v-for` is a `Motion` element inside an `AnimatePresence` its owner provides; `ui/Modal.vue` animates the backdrop and card and each sheet wraps its modal. A table row list is `<Motion as="tbody">` so the markup stays valid.
- **Tests stub the library.** `web/src/test-setup.ts` replaces `motion-v` with `web/src/test-motion.ts` (plain tags, instant exits), so behaviour tests never wait for an animation; the tokens and the reduced-motion switch are tested in `web/src/motion.test.ts`.

## Implementation notes

- **A fold glides** (`glideThrough` in `web/src/motion.ts`, used by `Island`): it runs the change, then tweens the panel's height, or the layout's grid columns for the width strip, from the value it had to the value the stylesheet now gives it, and hands the property back. The island's observers sleep while it runs and the island is measured once when it ends, because the layout moves on every frame of a glide.
- **The height tween holds the box.** `offsetHeight` counts padding and border, so while the height is tweened the element is set to `box-sizing: border-box` with `flex: none` and no min or max height; a content-box element would be set that much too tall. The held properties are removed when the tween ends.
- **The old value goes back on at once.** Before the tween's first frame the stylesheet's new value would otherwise show for a frame.
- **A folded body is not mounted** (`v-if`, not `display: none`): a row that mounts under a hidden ancestor never plays its enter motion and stays invisible after the panel is unfolded. RMA-319.
- **The test stand-in.** `web/src/test-motion.ts` renders `Motion` as its plain tag, drops the animation props (`initial`, `animate`, `exit`, `layout`, `transition`, `whileHover`, `whilePress`), passes `AnimatePresence` and `MotionConfig` through and resolves `animate` at once, so behaviour tests never wait for an animation. The real library runs in the browser build; the tokens are tested in `web/src/motion.test.ts`.
- **The island's floor** (`Island.vue`) counts only its own primary rows: those in its direct row scroller or its to-do list, never a table nested elsewhere in the body. A child's natural height ignores any room it was stretched into, so a floor never includes the island's own current height.
- **The dialog** (`ui/Modal.vue`): the backdrop fades and the card rises; the owner wraps it in `AnimatePresence` so it can leave the same way.

## Consequences

Easier: exits, list gliding and folds come from one engine and one set of numbers; a new banner or row is one `v-bind="fade"` or `v-bind="listed"` away; reduced motion is a single switch.

Harder: the built window grows. `motion-v` brings `framer-motion`, and `export * from 'framer-motion/dom'` does not tree-shake; the main chunk grew by about 170 kB (about 56 kB gzipped). Loading the feature set lazily (`LazyMotion` with the smaller `m` components) is the known way down, and is the next step if the size matters. A row that leaves stays in the DOM for 200 ms, so measuring code (`Island`'s floor) sees it for that long. Layout animation costs a measurement per listed element on each update, so very long lists are the place to watch. Impossible: an element that animates through its own timing numbers; they come from the tokens or the change is incomplete.
