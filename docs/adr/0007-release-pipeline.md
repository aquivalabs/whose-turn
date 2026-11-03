# 0007 — A tag publishes the package with the built window inside; the marketplace entry installs that package

## Status

Accepted, 2026-11-03. RMA-126, RMA-177. Closes the open point of [0001](0001-vue-window-with-a-build.md): who builds `dist/` for a user.

## Context

The window needs a build (0001) and the repository keeps sources only, `dist/` is gitignored. A Claude Code marketplace entry with a git source copies the repository as it is, so a user who installs from git gets a server without a window, and AGENTS.md says the user never builds. The maintainer decided on 2026-11-03 that the marketplace is BladeForge, not a marketplace of this repository's own, and that there is no submodule: the entry points at a published package.

## Decision

A tag `vX.Y.Z` on `main` runs `.github/workflows/release.yml`: it checks that the tag, `package.json` and `.claude-plugin/plugin.json` carry the same version, runs `npm run check`, builds `dist/`, packs, publishes the `whose-turn` package to npm under the maintainer's account with provenance (a prerelease such as `1.0.0-alpha.1` under the dist-tag `alpha`, a release under `latest`), and attaches the same tarball to a GitHub Release. The package carries only what the installed plugin runs: the server, the connectors, the plugin files (`bin/`, `hooks/`, `commands/`, `skills/`, `.claude-plugin/plugin.json`), `dist/`, the two shell scripts, the example config and the changelog; `test/package.test.mjs` pins that list. The BladeForge marketplace lists `whose-turn` with an `npm` source (`package: "whose-turn"`, `version: "alpha"` during the alpha, `latest` after), so `claude plugin install whose-turn@bladeforge` fetches the published package; Claude Code unpacks it without running scripts and installs no dependencies, because the package has none at runtime. The repository's own `.claude-plugin/marketplace.json` is gone; a checkout is loaded for development with `claude --plugin-dir`.

## Consequences

Easier: one command installs server, window and skill on a clean machine; a version bump is one tag. Harder: a release needs the `NPM_TOKEN` secret on the repository and a version bump in two files before the tag (the workflow refuses a mismatch); during the alpha the BladeForge entry follows the `alpha` dist-tag, so every alpha publish reaches users on their next plugin update. Impossible: a user building the window on their machine.
