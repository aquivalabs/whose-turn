# 0015 — Defaults cover the common case; everything else is the user's config, explained where it is set

## Status

Accepted, 2026-11-06. RMA-86.

## Context

Users differ in how they work: which tickets they watch, which signals they want, how loud the monitor should be. A setting that fits one person is noise for another. The monitor reaches users only through the window and through Claude: they install the built release through the plugin and never read the repository's README.

## Decision

- What almost every user needs is built in and on by default, for example a mention of you in a ticket comment.
- What people want differently is a setting with a switch, and its hint in the field says what it does and what it costs.
- The config belongs to the user. The monitor never guesses on their behalf, and a value the user wrote, such as their own JQL, is never rewritten.
- A setting is explained in the two places a user meets it: the hint in the window's settings field, and the `whose-turn` skill, which tells Claude to explain the setting, offer it, and change it only on the user's word. README.md documents the keys and the API for contributors, not for users.

## Consequences

Easier: one rule decides whether a new behaviour is a default or a switch, and where its explanation goes. Harder: every new setting needs a hint and a line in the skill in the same release. Impossible: a behaviour a user cannot turn off, or a setting explained only in the repository.
