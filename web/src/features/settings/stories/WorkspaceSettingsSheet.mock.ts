const fields = {
  workspace: [
    { key: 'id', label: 'Id', hint: 'short, used in the API and on disk', required: true },
    { key: 'name', label: 'Name' },
    { key: 'key_pattern', label: 'Ticket key pattern', hint: 'regex for keys in PR titles and to-dos' },
    { key: 'links', label: 'Quick links', hint: 'one per entry as "Label https://…"', list: true },
  ],
  theme: [
    { key: 'seed', label: 'Seed colour', hint: 'colours this workspace and the window', colour: true },
    { key: 'backdrop', label: 'Backdrop animal', hint: 'draw the dotted animal', boolean: true, default: true },
  ],
  rules: [{ key: 'backlog_rows', label: 'Backlog rows', hint: 'what the backlog lists', choices: ['all', 'mine'] }],
  statuses: [
    { key: 'in_review', label: 'In review', list: true },
    { key: 'on_hold', label: 'On hold', list: true },
  ],
};

const connectors = [
  { type: 'jira', label: 'Jira', fields: [{ key: 'site', label: 'Site', placeholder: 'your-org.example.com' }, { key: 'token', label: 'Token', secret: true }] },
  { type: 'github', label: 'GitHub', fields: [{ key: 'repos', label: 'Repositories', list: true, placeholder: 'your-org/your-repo' }] },
];

const rules = [
  { when: { 'pr.open': true, 'pr.checks': 'failing' }, then: { whose: 'me', next: 'Fix the failing checks' } },
  { when: { 'ticket.done': true }, then: { whose: 'nobody' } },
];

export const workspaceSettingsSheetStorybookMock = {
  default: {
    workspaces: [
      {
        id: 'demo',
        name: 'Demo',
        key_pattern: '\\bPROJ-\\d+\\b',
        connectors: [
          { type: 'jira', site: 'your-org.example.com' },
          { type: 'github', repos: ['your-org/your-repo'] },
        ],
        theme: { seed: '#6750a4' },
      },
      { id: 'side', name: 'Side project', connectors: [{ type: 'github', repos: ['your-org/side'] }] },
    ],
    connectors,
    adapters: {},
    fields,
    facts: { 'pr.open': { says: ['the PR is open', 'no PR is open'] }, 'pr.checks': { name: 'the PR checks' }, 'ticket.done': { says: ['the ticket is done', 'the ticket is not done'] } },
    tables: { demo: rules },
    problems: [],
  },
  empty: { workspaces: [], connectors, adapters: {}, fields, facts: {}, tables: {}, problems: [] },
  refused: {
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'The workspaces are not valid.',
      details: [{ '@type': 'BadRequest', field_violations: [{ field: 'workspaces[0].name', description: 'Name must not be empty.' }] }],
    },
  },
};
