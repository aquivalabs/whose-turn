# Changelog

What changed for you in each version of Whose Turn. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). The window shows this list under What's new; the ids at the end of an entry are ours and the window leaves them out.

## [Unreleased]

### Fixed
- A Linear issue you archived after finishing it still counts as done, in Recently done and in Done in the last 30 days. RMA-241.
- You no longer get stray notifications from our test runs, such as one about a "Northwind" workspace you never had. RMA-264.
- Clicking a "?" icon or a "why" link shows its explanation again, a second click or Escape closes it, and on a touch screen a tap opens it. Hints on buttons and panel edges still show only on hover. RMA-263.
- A hint no longer stays on screen after you drag a panel edge, fold the header or scroll. It goes away as soon as you press, drag or scroll, and when the thing it described disappears. RMA-261.

### Added
- When a ticket you worked on moves on in the tracker, for example reassigned and set to Ready for QA, or its PR merged, Your move now keeps a one-line note about it under Handled, such as "→ Passed to Sam · Ready for QA" with the time, and adds the latest comment when there is one. Click the line to see the full event, who it went to, the status and the comment, and to add your own note; "Open in feed" jumps to the change. The line disappears if the ticket comes back to you or after 7 days. RMA-258.
- After you click Handled, a small window offers a note for what the tracker does not record, for example "Checked with the customer, nothing to change". Save keeps it, Skip leaves the row handled without one. The note shows on a line under the row and in What changed as your own entry on that ticket, and a click on the line lets you edit or clear it. RMA-258.
- A "What's new" button above the gear lists what changed in each version, newest first. A dot on it means there are versions you have not read yet, and the "Updated to" chip opens the same list. RMA-253, RMA-260.

## [1.0.0-alpha.6] - 2026-11-04

### Fixed
- After an update the window tells you to reload it. While the update installs and the monitor restarts, the status bar shows a spinner, then "Updated to … · Reload". Before, the window kept running the old version and its buttons stopped working. RMA-255.
- Panel sizes you set are kept per workspace and per panel. Sizes set in the previous version are reset once. RMA-251.
- A saved token can no longer contain a line break, which could have broken how it is stored on a Mac. RMA-251.

## [1.0.0-alpha.5] - 2026-11-04

### Added
- You can resize the panels by dragging their edge. Each workspace remembers its sizes, a panel never gets smaller than one full row, and a double click on the edge resets it. RMA-246.
- You can edit a to-do: click the pencil or double-click the text. A deleted to-do can be brought back with Undo. RMA-172.

### Changed
- Settings describe the rules in plain words, and each next-step field says which situation it covers. RMA-173.
- You are "you" everywhere, never your full name. RMA-174.
- Settings warn you when a rule would hide every ticket, or when a catch-all rule stops the rules below it from ever applying. RMA-171.
- Many small fixes across the window: clearer labels, steadier layout, Undo where a click used to be final. RMA-148, RMA-175.

### Fixed
- The workspace header no longer breaks its links across lines, and a source no longer adds a second link to a site you already linked. RMA-249, RMA-250.
- In What changed, only the items you have not read are highlighted, not the whole group. RMA-201.
- The monitor keeps starting at login even after you remove the Node version it was installed with. RMA-215.
- A custom data folder or port set at install time is kept when the monitor starts at login. RMA-219.

## [1.0.0-alpha.4] - 2026-11-03

### Removed
- The demo workspaces and the "Try a demo workspace" button. A new install starts empty and asks you to add a source. RMA-208.

### Changed
- Updates install without running any scripts from the package, which makes them safer. RMA-236.

## [1.0.0-alpha.3] - 2026-11-03

### Added
- Whose Turn updates itself. When a new version is out you get one notification and an "Update" chip in the status bar; a click installs it and restarts the monitor. A new Claude Code session installs it for you and says so. RMA-231.

### Fixed
- The window updates live again when the monitor checks your sources. Before, you saw new items only after reloading the page.

## [1.0.0-alpha.2] - 2026-11-03

### Changed
- The Claude Code side of Whose Turn installs from the BladeForge marketplace as `whose-turn@bladeforge`. RMA-217.

## [1.0.0-alpha.1] - 2026-11-03

### Added
- The first public version: a local monitor of your GitHub, Jira and Linear work that says what is waiting on you, a window that updates live, desktop notifications, your own to-dos, and a Claude Code plugin that starts every session with that summary.
