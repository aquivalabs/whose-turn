# Tooltips

## What it is

Every element with `data-tip` shows its text in a Tippy tooltip, instantly on hover or keyboard focus. One
delegate on the page body covers rows drawn later. Tippy and Popper are the vendored scripts the page loads
first; `installTooltips` in `web/src/lib/tooltips.ts` wires them. RMA-261, RMA-263.

## Where it lives

| File | Role |
|---|---|
| `web/src/lib/tooltips.ts` | `installTooltips`: the delegate, the listeners, the tracking of shown tooltips; returns its teardown |
| `web/src/lib/tooltips.test.ts` | The dismissal and pinning cases |

## How it behaves

- Every shown tooltip is tracked. All of them are dismissed on pointer press, drag, scroll, window resize
  and Escape, and a tooltip goes when its control leaves the page or the layout.
- A pointer press elsewhere suppresses tooltips until the pointer is released, so a drag does not leave one
  behind.
- Explanation controls (`data-tip-click`: the "?" icons and "why" links) also toggle on click, which is what
  opens them on touch. A pinned tooltip stays until a second click, a press elsewhere or Escape.
- Without the Tippy script the install does nothing.

## What obliges an update

Any change to `web/src/lib/tooltips.ts` that changes when a tooltip shows or when it is dismissed.
