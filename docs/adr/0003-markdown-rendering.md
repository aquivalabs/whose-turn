# 0003 — Comment Markdown stays a hand-written tokeniser behind a DOM builder

## Status

Accepted, 2026-11-03. RMA-196, from the RMA-183 code review (C15). Applies the `meta:reuse-first` ladder to the one untrusted rich input in the window.

## Context

Comment bodies from Jira, GitHub and Linear are the only data the window renders with structure. AGENTS.md says data from the sources is rendered as text, never as HTML, and that only `https://` links are followed. `web/src/lib/markdown.ts` was a hand-written parser that built DOM nodes directly, with no recorded decision and no test, because `node:test` has no DOM. The subset in use is small: paragraphs, `#` headings, `>` quotes, lists, fences, `code`, `**bold**`, `*em*`, `[text](https://…)`, bare links and `@mentions`.

Ladder: the codebase has no other Markdown code, the platform has none, VueUse has none. Library candidates:

| Candidate | Verdict | Reason |
|---|---|---|
| `marked` + DOMPurify | rejected | Produces an HTML string that must be inserted with `v-html` and cleaned by a second library; the safety rests on a sanitiser allow-list instead of on never creating HTML. DOMPurify also needs a DOM, so the test story stays the same. |
| `markdown-it`, `html: false` | rejected | The HTML-off guarantee is real, but the renderer still emits a string for `v-html`; `javascript:` and `data:` links are filtered by its own validator, not by our `https://` rule, and bare `https://` links and `@mentions` need plugins. Using only its token stream would mean writing our DOM builder anyway, for a CommonMark surface we do not render. |
| `micromark` | rejected | Same string output, and it is a pipeline of many small packages for a feature set we use a fraction of. |
| Keep the hand-written one | chosen | No HTML string exists anywhere, so there is nothing to sanitise; the link rule is our own one-line `safeUrl`; the subset is the one the window needs. Size was not the deciding factor: the window is served locally. |

## Decision

The hand-written parser stays and is split in two. `web/src/lib/markdown-tokens.ts` is a pure tokeniser: a string in, a token tree out, no DOM, and a link that fails `safeUrl` is already plain text in the tree. `web/src/lib/markdown.ts` only turns tokens into text nodes and elements through `textContent`, never `innerHTML`. Mark lengths in the inline pattern are bounded, because the first test of a 100 KB run of `[` took seven seconds on the unbounded pattern. `test/markdown-tokens.test.mjs` runs the tokeniser under `node:test` against `javascript:` and `data:` links, `<script>` text, nested marks, unterminated fences and 100 KB hostile inputs.

## Consequences

Easier: the untrusted path is tested without a DOM, and the guarantee is structural. Harder: the supported syntax is ours to extend; a feature such as tables or nested lists is new code, and a request for full CommonMark would be the moment to reopen this record and take `markdown-it` token output as the input of the same DOM builder. Impossible: raw HTML in a comment ever reaching the page.
