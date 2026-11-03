# Changelog

All notable changes to whose-turn are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- The launch agent and the systemd unit start `launch.sh`, which resolves node at every start (login shell, PATH, then the install-time path), so removing a version-manager Node no longer breaks them. RMA-215.

### Added
- A presentation film in the README (docs/media/whose-turn-film.mp4, 80 s). RMA-233.

## [1.0.0-alpha.4] - 2026-11-03

### Changed
- The repository is public, and every release is published with npm provenance again. RMA-237.
- The self-update installs the new version with `--ignore-scripts`, as the plugin's first install does. RMA-236.

### Removed
- The demo connector and the first-run "Try a demo workspace" button. A pre-made workspace belongs to the demo, which is separate work; the scenarios live on as test fixtures. A config that still names a `demo` source reports it as an unknown connector type. RMA-208.

## [1.0.0-alpha.3] - 2026-11-03

### Added
- Self-update of the installed package. Every ten minutes the server reads the npm dist-tags (`latest`, which every publish moves) and, when a different version is out, reports it as `update` in `/api/summary`, `/api/state` and the stream, and raises one desktop notification per version. `POST /api/update` installs it into the package's own location and restarts the server; the status bar shows "<version> is out · Update", then "Updating…", then "Updated to <version>". A checkout is never offered an update. New reasons `UPDATE_IN_PROGRESS` (409) and `UPDATE_UNAVAILABLE` (412). RMA-231.

### Fixed
- The window opens its event stream again. Since RMA-197 the store waited for a `CLOSED` status that VueUse never reports before the first open, so the window never subscribed to `/api/stream` and picked up new polls only on a reload.

### Changed
- The release workflow publishes through npm trusted publishing (OIDC) instead of a stored token. RMA-235.

## [1.0.0-alpha.2] - 2026-11-03

### Removed
- The Claude Code plugin (skill, `/whose-turn`, SessionStart and prompt hooks, MCP server, `bin/` scripts, `.claude-plugin/plugin.json`). It now lives in the BladeForge marketplace as `whose-turn@bladeforge` and installs this package. RMA-217.

### Changed
- The package is the server and the built window; `install.sh` reads the port through `lib/config.mjs`. The release workflow checks the tag against `package.json` only.

## [1.0.0-alpha.1] - 2026-11-03

### Added
- First public release candidate: the local server with the GitHub, Jira, Linear and demo connectors, the rules table, the Vue window, the Claude Code plugin (skill, SessionStart hook, status line, MCP tools), desktop notifications and health alerts.
