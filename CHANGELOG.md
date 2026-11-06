# Changelog

What changed for you in each version of Whose Turn. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). The window shows this list under What's new; the ids at the end of an entry are ours and the window leaves them out.

## [Unreleased]

### Important
- Jira now shows a mention of you even on a ticket that was never yours, as one row to answer in Your move, so you may see new rows after the update. If you do not want them, turn off "Mentions on other tickets" in the Jira source of the workspace settings, or ask Claude to. What the monitor watches is yours to set: each setting says what it does where you set it, and Claude can explain and change it for you. RMA-86.

### Added
- Monitor settings has Restart and Quit. Restart reloads the monitor and the window comes back by itself; Quit asks first, stops checking your sources, and the window says how to start it again. RMA-356.

### Fixed
- Nobody else can read the title or the maintainer's answers of a report you sent by guessing its number: each new report gets its own key on your machine. For a report sent before this version you still see whether it is open or fixed, and its page says its answers cannot be shown. RMA-386.
- A review request or a mention now shows once, in the workspace that watches its repository, instead of in every workspace and twice where two repositories are watched. A request from a repository no workspace watches shows in the topmost visible workspace of the same organisation, so nothing is lost. RMA-378.
- A pull request waiting for your review stays in Your move after you open it on GitHub, until you review it or it closes; it also shows when GitHub's web notifications are turned off. A mention stays until you answer it, read or not. After the update, earlier mentions you read but did not answer come back once; mark them Handled. RMA-358.
- A pull request whose CI you re-ran and that passed no longer stays marked as failing; only the latest run of each check counts now. RMA-382.
- With reduced motion turned on in your system, the "+N more" line under a list now jumps to the hidden rows instead of scrolling smoothly. RMA-375.

### Changed
- A report you send from the Report sheet or through Claude now also carries counts about the monitor's health: how long ago it last polled, which kinds of source fail and with what kind of error, how many rows each list holds, your poll settings, and for the window which view was open and how much of each list was in view. No names, keys, titles, links or error text go along, and "What is sent" in the Report sheet shows the exact payload before you send. The time zone now goes as an offset from UTC and the screen size rounded to the nearest 100. RMA-383.
- The window now follows the text size you set in your browser: raise the default font size and the whole window grows with it, instead of keeping its fixed size. With a large font it switches to the narrow layout sooner, so columns do not crowd each other. RMA-344, RMA-377.

## [1.0.0-alpha.14] - 2026-11-05

### Fixed
- Waiting on others really scrolls again: the fix in 1.0.0-alpha.13 did not reach the list. RMA-354.

## [1.0.0-alpha.13] - 2026-11-05

### Fixed
- Waiting on others scrolls again when it has more rows than fit; since 1.0.0-alpha.10 the list ran past the panel and could not be scrolled. RMA-354.

## [1.0.0-alpha.12] - 2026-11-05

### Changed
- The status bar is arranged in three groups: the connection state and Refresh now on the left, the update chip in the middle, and Copy for AI, Open as app, notifications and Report on the right. RMA-343.

## [1.0.0-alpha.11] - 2026-11-05

### Added
- The Update button now updates the Claude plugin too. When the new version is in, the chip says "Reload Claude skill · Copy": it copies `/reload-plugins --force`, which you paste into your open Claude session to load the update there. If Claude cannot be found or its update fails, the chip says "Update Claude skill · Copy" and copies the command to run yourself. After a copy the chip does not come back for that version. RMA-341.

## [1.0.0-alpha.10] - 2026-11-05

### Changed
- The window opens faster: the code that runs the animations now loads after the window's own code instead of before it, so the first screen no longer waits for it. RMA-314.
- The last row leaving Waiting on others fades out with the list before "Nothing is waiting on someone else." appears. A folded group in What changed and a closing Recently done now fold smoothly instead of vanishing at once. RMA-314.
- An install pinned to one version no longer shows the Update button and is never updated, whether from the window or by Claude. RMA-330.
- Monitor settings now keep each number within a sensible range: polling from 15 seconds to an hour, history from 1 to 365 days, stale after 1 minute to a day, failing polls 1 to 100. The fields show the limits, and a value outside them is refused, so a typo can no longer switch polling or the health alerts off. RMA-332.
- A new version of Whose Turn no longer installs by itself when a Claude session starts. Claude tells you it is out and installs it only when you say yes; the Update button in the window works as before. RMA-329.

### Fixed
- A polling or health number typed into the config file by hand now has to stay within the same range as in the settings. A value outside it is ignored, the default is used instead, and the problem is listed where the window shows config problems. RMA-339.
- A report with a title or text that is too long, or that contains a stored secret, is now refused whichever way it was sent, including by Claude, and nothing leaves your machine. RMA-339.
- The last open panel of a column, such as Waiting on others, no longer shows a resize grip on its bottom edge, since dragging it changed nothing. The edge between two panels keeps its grip, and when the panel below is folded the grip above goes, then comes back when it is opened again. RMA-312.

## [1.0.0-alpha.9] - 2026-11-04

### Added
- A report that is fixed but not yet released now reads "Fixed, coming in the next release" on its report page and in the Report sheet, with its own colour, and the change counts as news on the Report button. RMA-321.
- A workspace you do not need right now can be parked or paused: pick one under In the list in its settings, each choice with a line that says what it does. Either way it leaves the rail, and its sources, marks, to-dos and cache stay. A parked workspace is checked every 15 minutes instead of every poll, and when a check finds something new that is your move it comes back into the rail by itself, with a dot, a line in its feed that says why, and the usual desktop notification. After a restart a parked workspace is checked 15 minutes after its last check, not at once. A paused workspace is not checked at all and comes back only when you restore it. A line at the bottom of the rail, such as "3 hidden" (hover for the split into parked and paused), opens Monitor settings, where each one is listed with its mode and a Restore button. RMA-320, RMA-323.
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
- A ticket waiting for a release no longer shows as your move; it waits under Waiting on others. RMA-322.
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
- The window updates live again when the monitor checks your sources. Before, you saw new items only after reloading the page. RMA-231.

## [1.0.0-alpha.2] - 2026-11-03

### Changed
- The Claude Code side of Whose Turn installs from the BladeForge marketplace as `whose-turn@bladeforge`. RMA-217.

## [1.0.0-alpha.1] - 2026-11-03

### Added
- The first public version: a local monitor of your GitHub, Jira and Linear work that says what is waiting on you, a window that updates live, desktop notifications, your own to-dos, and a Claude Code plugin that starts every session with that summary.
