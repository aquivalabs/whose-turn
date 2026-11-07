# 0011 — Whose turn is decided once, on the server; the window only renders the rows it receives

## Status

Accepted, 2026-11-06, recording a decision in force since RMA-80. RMA-367.

## Context

The monitor answers one question, whose move a ticket, a pull request or an ask is, and it answers it to two readers: the window and Claude. Before RMA-80 the old install computed part of the answer in the page. Two places then disagreed whenever one of them changed, and Claude, which reads the API, saw different rows from the window.

## Decision

The rules are evaluated in one place, on the server, in `lib/rules.mjs` over the facts in `lib/facts.mjs`, matched against the workspace's rules table (`docs/mechanisms/rules-table.md`). The server sends finished rows: the move, its group and its status. The window renders them and computes no turn of its own. The texts a team cares about, such as what to do once a PR is approved or which branches are release branches, come from the workspace config, not from code.

## Consequences

Easier: the window and Claude always agree, and a rule changes in one file with one test. Harder: anything the window shows about a turn must first exist in the API. Impossible: a turn the window decides that Claude cannot see.
