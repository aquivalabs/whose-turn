// docs/mechanisms/i18n.md
export default {
  bar: {
    openedInApp: 'Opened in the app window. You can close this tab.',
    appNotOpened: 'The app window did not open',
    refresh: 'Refresh now',
    copyForAi: 'Copy for AI: everything',
    openInBrowser: 'Open in browser',
    opening: 'Opening…',
    openAsApp: 'Open as app',
    report: 'Report',
    reportTitle: 'A bug or a wish about this monitor, straight to its backlog',
    reportNews: 'A report has news',
  },
  update: {
    seeChanges: 'See what changed',
    done: 'Updated to {version}',
    reloadTitle: 'Reload the window to apply the changes',
    ready: 'Updated to {version} · Reload',
    restarting: 'Restarting…',
    installing: 'Installing {version}…',
    reload: 'Reload',
    slowRestart: 'The restart is taking longer than usual',
    failed: 'Update failed · Retry',
    out: '{version} is out · Update',
    notStarted: 'The update did not start',
    copyNotRecorded: 'The copy was not recorded',
    pluginTitle: 'Copies {copy}: {hint}',
    pluginUpdate: 'Update Claude plugin · Copy',
    pluginUpdateHint: 'paste it in your Claude session to update the whose-turn plugin, then run /reload-plugins --force',
    pluginFailedHint: 'the monitor could not update the Claude plugin; paste it in your Claude session, then run /reload-plugins --force',
    pluginBehindHint: 'a Claude session still runs a plugin that does not know monitor {current}; paste it in that session, then run /reload-plugins --force',
  },
  notifications: {
    on: 'Notifications on',
    off: 'Notifications off',
    onTip:
      "Desktop notifications are on for every workspace. Click to turn them all off; the window and Claude's session summary keep updating.",
    offTip:
      "Desktop notifications are off for every workspace. The window and Claude's session summary still update. Click to turn them back on.",
  },
};
