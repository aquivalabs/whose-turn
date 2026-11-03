# Species description

## What it is

Every animal behind the glass is a JSON file in `web/src/species/`. The file lists shapes; the interpreter in
`web/src/lib/species.ts` turns it into a shape list from a seeded random; `web/src/lib/silhouette.ts` paints
the shapes onto a mask; `web/src/backdrop.ts` turns the mask into dots. A new animal is one new JSON file:
nothing else changes. The same file serves a request such as "add an otter": write `web/src/species/otter.json`
to the contract below, open `/sheet?species=otter` (the dev server serves it as `/sheet.html`), adjust, run `npm test`.

## Where it lives

| File | Role |
|---|---|
| `web/src/species/<name>.json` | One species. The file name is the species name. |
| `web/src/species/base/<name>.json` | A base other species extend (`"abstract": true`). |
| `web/src/species/index.ts` | Bundles both folders; a new file needs no registration. |
| `web/src/lib/species.ts` | Interpreter: expressions, statements, `extends`, poses. No DOM. |
| `web/src/lib/silhouette.ts` | Paints shapes (spline tubes and blobs, cut-outs) onto a canvas. |
| `web/src/lib/random.ts` | The seeded random the expressions draw from. |
| `web/src/backdrop.ts` | Picks species, pose and layout from the seed; draws the dots. |
| `web/sheet.html`, `web/src/components/SheetPage.vue` | The test sheet at `/sheet`. |
| `test/species.test.mjs` | Interpreter tests and a sweep over every bundled species. |

## Coordinates

Facing right, y grows downward, the origin is the middle of a 2.6-unit square. Keep every point within about
1.3 of the origin, or the mask clips the animal. The backdrop mirrors, tilts and stretches the animal on its
own, so a species is always drawn facing right.

## File shape

```json
{
  "extends": "quadruped",
  "abstract": false,
  "params":  { "name": value, "...": "..." },
  "defs":    { "defName": [ statement, "..." ] },
  "body":    [ statement, "..." ],
  "drop":    [ "part", "..." ],
  "poses":   { "poseName": { "weight": 1, "params": {}, "drop": [], "body": [] } }
}
```

All keys are optional. `params` are evaluated first, in file order, then `body`. A name used before it is
set is an error that names the species.

## Values

A value is one of:

- a number: `0.3`
- an expression string: `"headY - 0.12 - earHeight"`
- an array of values: `[0.3, "bodyY"]`; a point is `[x, y]`
- `{ "if": cond, "then": value, "else": value }`; only the branch taken is evaluated
- `{ "map": { "count": n | "values": list, "as": "name", "let": {}, "value": value } }`: builds an array,
  one element per pass, `index` and `as` in scope

### Expressions

Operators `+ - * / %`, unary `-`, parentheses, comparisons `< > <= >= == !=`, indexing `list[i]`, the
constant `PI`, and names from `params`, `let` and loops.

| Call | Meaning | Random draws |
|---|---|---|
| `range(a, b)` | uniform float from a to b | 1 |
| `int(a, b)` | uniform integer from a to b, both included | 1 |
| `chance(p)` | true with probability p | 1 |
| `vary(v, spread)` | v times a factor in 1 - spread to 1 + spread, spread defaults to 0.12 | 1 |
| `if(cond, a, b)` | a or b, only that branch is evaluated | those of the branch |
| `cos sin sqrt abs hypot min max lerp clamp len` | as in JavaScript; `lerp(from, to, t)`, `clamp(v, lo, hi)` | 0 |

Draws happen left to right in reading order, so the same seed always gives the same animal. Reordering
statements or expressions changes which animal a seed draws.

## Statements

Run in order, each shape is appended to the drawing. Every statement may carry `"part": "name"`.

| Statement | Effect |
|---|---|
| `{ "let": { "a": value, "b": value } }` | Sets names in the current scope, in order. |
| `{ "repeat": { "count": n, "as": "i", "body": [...] } }` | n passes, `index` from 0. |
| `{ "repeat": { "values": [..], "as": "x", "body": [...] } }` | One pass per list item; `as` holds the item. |
| `{ "if": cond, "then": [...], "else": [...] }` | Runs one list; `else` is optional. |
| `{ "use": "def", "with": { "arg": value } }` | Runs a `defs` list with the arguments set, same scope otherwise. |
| a shape | See below. |

A `repeat` body, an `if` list and a `use` run in a child scope: names they set vanish afterwards, outer names
stay readable.

### Shapes

| Shape | Form | Notes |
|---|---|---|
| ellipse | `{ "ellipse": [x, y, radiusX, radiusY, angle] }` | `angle` in radians, optional. |
| circle | `{ "circle": [x, y, radius] }` | |
| polygon | `{ "polygon": [[x, y], ...] }` | Straight edges: ears, horns, spikes. |
| blob | `{ "blob": [[x, y], ...] }` | Closed smooth curve through the points: bodies, shells. |
| tube | `{ "tube": [[x, y], ...], "radii": r \| [r, ...] }` | Smooth open curve with a width that interpolates along the radii list: legs, tails, necks. |

Add `"cut": true` to remove the shape from everything drawn before it: eyes, mouths, feather lines. Order
matters: a cut only affects earlier shapes. A tube needs a radius of at least its length divided by 48, or it
shows as dots.

## Extending a base

`"extends": "quadruped"` starts from the base's `params`, `defs`, `body` and `poses`:

- `params`: the species' entries replace the base's values in place and new names are appended. Expressions
  in the base read the replaced values, so overriding `legLength` moves the body too.
- `body`: the species' statements are appended after the base's.
- `drop`: removes the base statements whose `part` is listed. Use it to replace a part, then add the
  replacement in `body` with the same `part`.
- `poses`: merged by name; a species pose entry overrides weight, params, drop and body of the base's.

### Bases and their params

| Base | Draws | Parameters to override |
|---|---|---|
| `quadruped` | side-on four-legged animal | `bodyRadiusX/Y`, `legLength`, `legWidth`, `headRadiusX/Y`, `headX/Y`, `neckWidth`, `snoutLength/Radius`, `earHeight/Width/Spread`, `tailLength/Lift/Width` |
| `bird` | perched or standing bird | `bodyRadiusX/Y`, `bodyAngle`, `legLength`, `headRadius`, `headX/Y`, `beakLength/Height`, `tailLength/Spread/Drop`, `wingWidth` |
| `swimmer` | fish, dolphin, shark side-on | `length`, `height`, `dorsalHeight`, `finLength`, `flukeSpan`, `eyeX`, `eyeSize`, `arch` |

Overriding a few parameters gives a new species of the same family: `otter.json` is a quadruped with a long
low body, short legs and a thick tail. Parts that no parameter can change (a mane, a crest) are added in
`body`. A base species that must not appear on its own has `"abstract": true`.

## Poses

A species with two or more poses draws one per seed: the weights decide, a weight of 0 disables a pose, a
weight defaults to 1. The draw costs one random number and is the first draw, so a species without poses
draws exactly as before. A pose may set `params` over the species', `drop` parts of the body, and append
`body` statements. `show({ pose })` and the sheet force one. Bases carry these poses:

- `quadruped`: standing, walking (`stride`), sleeping, sitting, front (looking at the camera)
- `bird`: perched, sleeping, front
- `swimmer`: cruising, leaping (`arch`; weight 0 in the base, a species that can leap sets it, as `dolphin.json` does)

A species written without a base can use poses the same way; `cat.json` has a sitting and a walking pose, each
a full body.

## Example

`web/src/species/otter.json` in full, a species added without touching any code:

```json
{
  "extends": "quadruped",
  "params": {
    "bodyRadiusX": "range(0.56, 0.62)",
    "bodyRadiusY": "range(0.2, 0.24)",
    "legLength": "range(0.16, 0.22)",
    "legWidth": 0.075,
    "headRadiusX": 0.17,
    "headRadiusY": 0.15,
    "headX": "bodyRadiusX + 0.02",
    "headY": "bodyY - bodyRadiusY * 0.7",
    "neckWidth": "bodyRadiusY * 0.8",
    "snoutLength": 0.11,
    "snoutRadius": 0.07,
    "earHeight": 0.04,
    "earWidth": 0.05,
    "tailLength": "range(0.5, 0.62)",
    "tailLift": "range(-0.1, 0.05)",
    "tailWidth": 0.11
  }
}
```

`hedgehog.json` shows `repeat` with per-pass `let` (spikes), `deer.json` shows `defs` and `use` (antlers),
`snail.json` and `turtle.json` show `map` (spiral and dome), `rabbit.json` shows `if` inside values.

## Checking a species

- `/sheet?species=<name>&seeds=6` draws every pose over several seeds, flat, without the glass. The server serves it
  from a built `dist/`; `npm run dev:web` serves it as `/sheet.html`.
- `npm test` builds every bundled species in every pose over 60 seeds and fails on a name error, a
  non-finite number or an animal far outside the frame.
- Species are chosen by `Math.floor(random * count)` over the file names sorted alphabetically, so adding a
  file changes which animal an existing seed rolls. A species forced by name is unaffected.

## What obliges an update to this page

A change to the interpreter (`species.ts`), the shape painter (`silhouette.ts`), a base file under
`web/src/species/base/`, or the way `backdrop.ts` picks a species or pose.
