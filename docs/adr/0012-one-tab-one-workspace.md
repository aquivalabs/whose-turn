# 0012 — One tab is one workspace, and nothing is mixed between workspaces

## Status

Accepted, 2026-11-06, recording a decision in force since RMA-81. RMA-367.

## Context

A person watches several unrelated places of work: an employer's Jira and GitHub, a side project's Linear. Mixing them in one list hides which context a row belongs to and leaks one employer's names into another's view.

## Decision

A workspace has its own connectors, its own feed, its own to-dos and its own marks. The window shows one workspace per tab of the rail. Nothing is merged between workspaces. The one exception is the Claude session summary (`GET /api/summary`), which lists every workspace, each under its own name, so a new session sees everything at once.

## Consequences

Easier: each context stays clean, and a workspace can be parked or paused alone. Harder: a person with many workspaces switches tabs. Impossible: a row from one workspace in another's list.
