export const settingsFrameStorybookMock = {
  title: 'Workspace settings',
  problems: ['Rules: one status group is empty.', 'Connectors: the token is missing.'],
  unloaded: 'Cannot load the settings: the monitor is not reachable.',
  ask: { text: 'Discard the unsaved changes?', yes: 'Discard', no: 'Keep editing', run: () => undefined },
  body: 'The form of a sheet goes here.',
};
