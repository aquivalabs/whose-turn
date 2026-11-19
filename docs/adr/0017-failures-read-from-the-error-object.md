# 0017 — A failure is read from the error object, never from its message

## Status

Accepted, 2026-11-19. RMA-483, from the critique rounds of RMA-481.

## Context

A connector turned a failed part into the string `name: message`, and `RateLimited` carried only a message. In the user reports of November most failures arrived as `PARTIAL` or `UNKNOWN`, and none could be explained from the report: the HTTP status, the network error and which GitHub limit ran out were already gone. Parsing the message back would leak what it holds, hosts and paths included, which nothing about a user's employer may do (AGENTS.md).

## Decision

`lib/failure.mjs` describes a failure from the error object only: a closed code (with `NO_TOKEN` and `NO_FILE` for a source that cannot start), the HTTP status, an error class from a closed list (the cause's errno first, then the error's own errno, then its name, else `other`), and for a rate limit the limit GitHub names in `x-ratelimit-resource` and the minutes until it resets. A connector may return `failures: { part: description }` beside `errors: { part: message }`; the contract checks it like any other shape, and a user adapter that returns only `errors` is still contract 1. A rate limit in one GitHub part fails that part and leaves the others' data current. The report shows each failure as one token of closed values, `type:CODE[:part][:partCODE][:status][:class][:limit][:resetNm]`, with a part a reportable connector does not declare reading as `other`.

## Consequences

Easier: a report says that GitHub ran out of its search limit for twelve minutes, or that Jira's host did not resolve, without asking the user. Harder: a connector that wants its failures explained builds them with `describeFailure`. Impossible: a message, a host or a part name a user adapter invented reaching a report.
