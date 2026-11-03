# Changelog

All notable changes to whose-turn are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-alpha.2] - 2026-11-03

### Removed
- The Claude Code plugin (skill, `/whose-turn`, SessionStart and prompt hooks, MCP server, `bin/` scripts, `.claude-plugin/plugin.json`). It now lives in the BladeForge marketplace as `whose-turn@bladeforge` and installs this package. RMA-217.

### Changed
- The package is the server and the built window; `install.sh` reads the port through `lib/config.mjs`. The release workflow checks the tag against `package.json` only.

## [1.0.0-alpha.1] - 2026-11-03

### Added
- First public release candidate: the local server with the GitHub, Jira, Linear and demo connectors, the rules table, the Vue window, the Claude Code plugin (skill, SessionStart hook, status line, MCP tools), desktop notifications and health alerts.
