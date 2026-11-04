# Changelog

What changed for you in each version of Whose Turn. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). The window shows this list under What's new; the ids at the end of an entry are ours and the window leaves them out.

## [Unreleased]

### Added
- A report that is fixed but not yet released now reads "Fixed, coming in the next release" on its report page and in the Report sheet, with its own colour, and the change counts as news on the Report button. RMA-321.
- Each workspace now has its own settings, opened with the gear at the top right of its header: name, links, look, sources, rules and Delete workspace, for that workspace only. RMA-304.
- The gear at the bottom of the rail now opens Monitor settings: desktop notifications on or off, how often to poll, how many days of history to keep, and when to warn about stale or failing sources, with the path of the config file. RMA-304.
- A + at the end of the workspace list adds a workspace: it opens the same form, empty, and switches to the new workspace when you save. RMA-304.
- A workspace can turn off the dotted backdrop animal: untick Backdrop animal under Look in its settings, and the plain background stays. RMA-300.
- The Report button shows a dot and gives a short wiggle now and then when one of the reports has news: a new state or a new answer, and for the maintainer also a new user report. It calms down once you open the Report sheet. The monitor looks at most every ten minutes, and the wiggle is off when your system asks for reduced motion. RMA-311.
- If you maintain Whose Turn, the Report sheet lists every user report, not only yours, and marks the ones you filed. Everyone else still sees only their own. RMA-306.
- A ticket in code review now shows the names of the reviewers still asked to review its pull request, instead of just "Reviewer". RMA-298.

### Changed
- Motion in the window is slower and softer, so panels, rows and dialogs glide instead of snapping. RMA-316.
- A ticket in code review now lists every reviewer of its pull request, none hidden: the ones still asked to review by name, and the ones who already did with a check for approved or a cross for changes requested. The list wraps onto more lines when it is long, and your own review is left out. RMA-315.
- The window moves smoothly: panels fold, rows slide in and out, dialogs fade. Turning on Reduce motion in your system settings switches it off. RMA-313.
- The grip mark on a panel's resize edge is a little larger and darker while you are not pointing at it, so it is easier to find; it is still quiet next to the content. RMA-310.
- On the folded What changed strip, the number of unread changes now reads from top to bottom, one upright character under another, and the hint about the arrow opens to its left instead of floating over the cards. RMA-309.
- The edges you can drag to resize a panel now show a small grip mark, and a line and the resize cursor appear when you point at them. The mark stays faint while you are not using it. RMA-303.
- Folding What changed now shrinks it to a thin strip at the right edge that still shows its title and the number of unread changes, and the other panels take the freed width. Click the strip or its arrow to open it again at the width you had. RMA-301.
- Handled now asks for the note first: Save or Skip marks the row handled, and closing the window with Escape leaves the row open. RMA-271.

### Fixed
- Folding and unfolding the workspace header, and the panels, is now one smooth change in height instead of overshooting and jumping back. RMA-318.
- A panel that was folded when the page loaded now shows its rows when you unfold it, instead of staying empty. RMA-319.
- Your move no longer keeps growing when it is empty and Recently done has rows. RMA-307.
- A reassignment in the feed now shows your own name as "you", the same as the Handled trace does. RMA-270.
- The comment shown with a passed-on row is now read from the feed when you open it, so it is always the full text. Once the comment has dropped out of the feed, only the short line remains. RMA-269.

## [1.0.0-alpha.8] - 2026-11-04

### Added
- A bell in the status bar, "Notifications on", turns desktop notifications off for the whole monitor and back on. When they are off the button turns red and says "Notifications off", and the choice is kept after a restart. RMA-283.
- Anyone can now send a report from the Report sheet and see its answer, without connecting anything. A report goes to the maintainer, and the sheet says so. RMA-280.
- A report now carries only the title and text you write, the monitor version and a short description of your system (OS, Node version, how the monitor was installed, browser, screen and window size, language, time zone, light or dark, app window or tab, and which kinds of source you use, such as github or linear); nothing from your workspaces, tickets, names or links is sent with it. RMA-291.

### Changed
- The `feedback` settings for a Linear workspace, team, project and key are gone: reports no longer need them, and old values in your config are dropped the next time it is saved. RMA-280.

### Fixed
- An empty panel, such as Your move with nothing in it, now shrinks to its message instead of keeping the height you once dragged it to. The height comes back when rows appear. RMA-294.

## [1.0.0-alpha.7] - 2026-11-04

### Fixed
- If the ticket you are writing a note for leaves Your move while the note window is open, the window closes and the rest of the monitor stays usable. Before, nothing could be clicked and no window was visible. RMA-274.
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
