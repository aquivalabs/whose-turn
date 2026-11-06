# 0014 — The config API trusts every local process, and binds each stored token to its service, account and endpoint

## Status

Accepted, 2026-11-06, recording a decision in force since the config-API decision in AGENTS.md. RMA-367.

## Context

Claude edits the workspace config through `POST /api/config` and stores tokens through `POST /api/secrets`. The server listens on localhost only. A browser page could reach it unless the request is checked, and so could any process on the machine.

## Decision

`POST /api/config` and `POST /api/secrets` are guarded by the Host and Origin headers only. That stops browsers and DNS rebinding, but not a process on the same machine. This is accepted: the data directory is readable by every local process anyway, and the tool exists so that Claude can edit the config. A stored token is bound to its service, account and endpoint. A config write that would point an existing token at a new endpoint, account or store entry is refused unless the same request carries the token again (`secretsRequired` in `connectors/index.mjs`). So a local process without the token cannot redirect it. Endpoints must be https.

## Consequences

Easier: Claude and the window share one write path, with no extra secret to hand around. Harder: the guard is only as strong as the local machine. Impossible: a web page writing the config, or a local process sending a stored token to its own endpoint.
