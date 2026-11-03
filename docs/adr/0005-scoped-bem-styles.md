# 0005 — Each component owns its styles in a scoped BEM block; the global sheet keeps layout and primitives

## Status

Accepted, 2026-11-03. RMA-127. Supersedes in part [0001](0001-vue-window-with-a-build.md): the line that kept the ported stylesheet global with flat `wt-` names through the migration.

## Context

RMA-125 moved the window to Vue components but kept the old window's stylesheet global (`web/src/styles/base.css`, about 440 flat `wt-*` rules), so the look stayed identical while the markup changed; Stylelint skipped that file. Any rule could reach any element, the names said nothing about which component owned them, and the order of a rule in one long file decided several looks (the feed's view switch kept a margin only because a later rule won). The house rule (`frontend-vue:bem-styles`) is one block per component named after it, in `<style scoped>`, with state as modifier classes and colours from tokens.

Options on the table: rename the global rules to BEM in place and keep one file; move every rule into its component, including the shared ones; or move what one component owns and keep a small global layer for what many share.

## Decision

- Every component that has styles owns a `<style scoped>` block named after it in kebab-case (`FeedItem.vue` owns `.feed-item`, `.feed-item__kind`, `.feed-item--new`); state is a modifier class bound from the template, never an inline colour.
- `web/src/styles/base.css` keeps only what several components share: page resets, the dashboard's grid and fit layout (`.dashboard`, `.dashboard--fit`, and `dashboard__move`, `__todo`, `__waiting`, `__feed`, which the window puts on the islands in place of the old ids), and the primitives `island`, `fold-toggle`, `table`, `pill`, `age`, `handled-chip`, `at-you`, `ticket-key`, `timestamp`, `ai-hint`, `hint-icon`, `hint-row`, `empty`, `visually-hidden`, `hide-narrow`, `btn`, `input`, `alert`, `modal`, `sheet-form`, and the Tippy theme. No `wt-` prefix remains on a class: the window is not embedded anywhere else, so nothing needs a namespace. The Tippy theme keeps its name `wt`, which is a Tippy option, not a class.
- `web/src/styles/tokens.css` stays the token source; the colours that were literals in rules (page background, unread accent, live dot, tooltip, the forced-light header ink) are tokens there now.
- A parent never restyles a child's insides. A child that must look different in one place takes a prop and owns the rule (`Island`'s `column`, `FeedItem`'s `lit`). `:deep()` is used once, in the Markdown view, whose nodes are built from text and carry tags, not classes.
- Stylelint checks `base.css` and every scoped block. Two exceptions sit in `stylelint.config.js` with their reasons: `-webkit-backdrop-filter` is allowed because Safari before 18 needs it for the glass, and `MarkdownView.vue` may use element selectors.

## Consequences

Easier: a class name says which file owns it, a rule cannot leak into another island, and Stylelint guards the whole window. Harder: a look shared by two components needs a decision (a primitive here or a shared component), and a parent that wants a child to look different has to give the child a prop. Impossible: restyling a component from the global sheet by accident.
