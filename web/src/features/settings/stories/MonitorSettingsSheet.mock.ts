export const monitorSettingsSheetStorybookMock = {
  default: {
    settings: { poll_seconds: 60, notify_after: 5, backlog_days: 14, feed_days: 7 },
    settings_fields: {
      poll_seconds: { label: 'Poll every (seconds)', hint: 'How often the sources are asked.', min: 15, max: 600 },
      notify_after: { label: 'Notify after (minutes)', hint: 'A row waits this long before a desktop notice.', min: 1, max: 120 },
      backlog_days: { label: 'Backlog age (days)', hint: 'Older rows move to the backlog.', min: 1, max: 90 },
      feed_days: { label: 'Feed length (days)', hint: 'How far back the feed reaches.', min: 1, max: 30 },
    },
    config_file: '~/.config/whose-turn/config.json',
    problems: [],
  },
  refused: {
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'The settings are not valid.',
      details: [
        {
          '@type': 'BadRequest',
          field_violations: [{ field: 'settings.poll_seconds', description: 'Poll every must be at least 15.' }],
        },
      ],
    },
  },
};

export const monitorHiddenWorkspaces = [
  { id: 'side', name: 'Side project', hidden: 'parked' },
  { id: 'old', name: 'Old team', hidden: 'paused' },
];
