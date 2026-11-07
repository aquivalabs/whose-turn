# 0016 — Window texts live in one catalog through vue-i18n

## Status

Accepted, 2026-11-06. RMA-342.

## Context

The window's texts lived in its components and in a few plain modules. A second language, or one consistent change of wording, meant hunting through every `.vue` file. Maintainer, 2026-11-05: move every text into i18n "by the book": the standard library, one file per logical section, one common file that assembles them.

## Decision

The window uses `vue-i18n` 11, pinned exactly, in Composition API mode (`legacy: false`), with the English catalog in `web/src/i18n/en/`, one file per section and an `index.ts` that only assembles them. Components call `useText()` and plain modules `text()` from `web/src/i18n/index.ts`; both take a key typed as a leaf path of the English catalog, so a missing or mistyped key fails the type check. `@intlify/eslint-plugin-vue-i18n` refuses a literal visible text in a template, and `test/i18n-catalog.test.mjs` renders every message so a stray `@` or `|` cannot break one. The runtime message compiler ships with the window: the built JavaScript grew from 144.6 kB to 166.9 kB gzipped, measured on 2026-11-06, which is acceptable for a page served from the local machine. Texts the server writes stay out of the catalog.

## Consequences

Easier: a translation is one more catalog of the same shape, and a wording change is one line. Harder: every new visible text needs a key, and a message that contains `@` or `|` must escape it (`{'@'}`). Impossible: a raw English string in a template passing the lint.
