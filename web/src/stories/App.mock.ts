import type { Snapshot, TurnRow } from '@/lib/types.ts';

const hour = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour).toISOString();

const workspace: Snapshot['workspace'] = {
  id: 'demo',
  name: 'Demo',
  connectors: [
    { id: 'github', type: 'github', label: 'GitHub' },
    { id: 'tracker', type: 'jira', label: 'Tracker' },
  ],
  links: [{ label: 'Board', url: 'https://example.com/board' }],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
  open_moves: 2,
};

const other: Snapshot['workspace'] = { ...workspace, id: 'side', name: 'Side project', open_moves: 0 };

const row = (key: string, summary: string, group: TurnRow['group'], rank: number, extra: Partial<TurnRow> = {}): TurnRow => ({
  row_id: key,
  key,
  summary,
  ticket_url: `https://example.com/browse/${key}`,
  group,
  rank,
  updated: at(rank + 1),
  status: 'In Progress',
  next: 'Reply to the question',
  ...extra,
});

const turn: TurnRow[] = [
  row('PROJ-12', 'Item — rising', 'you', 1, { next: 'Reply to the question', comment: 'Could you take another look at the retry?' }),
  row('PROJ-13', 'Item — steady', 'you', 2, { status: 'Code Review', next: 'Review the change' }),
  row('PROJ-14', 'Item — falling', 'others', 3, { status: 'QA', next: 'Waiting for dana', whose: 'dana' }),
  row('PROJ-9', 'Item — settled', 'done', 4, { status: 'Done', next: '' }),
];

const feed: Snapshot['feed'] = [
  { id: 'e1', ref: 'PROJ-12', key: 'PROJ-12', title: 'Item — rising', kind: 'comment', who: 'dana', at: at(0.2), text: 'Could you take another look at the retry?', source: 'github' },
  { id: 'e2', ref: 'PROJ-13', key: 'PROJ-13', title: 'Item — steady', kind: 'review', who: 'lee', at: at(1), text: 'Approved', source: 'github' },
  { id: 'e3', ref: 'PROJ-14', key: 'PROJ-14', title: 'Item — falling', kind: 'status', who: 'sam', at: at(3), text: 'In Progress → QA', source: 'tracker' },
];

const healthy: Snapshot['health'] = { ok: true, stale: false, fresh_at: at(0), failing: [], alerts: [] };

const filled: Partial<Snapshot> = {
  workspaces: [workspace, other],
  workspace,
  turn,
  feed,
  marks: { seen: ['e3'], base: 0, handled: {}, info: {} },
  counts: { mine: 2, others: 1, failing: 0, done: 1 },
  todos: [
    { id: 't1', text: 'Reply to the question on PROJ-12', done: null, created: at(0.5), key: 'PROJ-12', ticket_url: 'https://example.com/browse/PROJ-12' },
    { id: 't2', text: 'Write down the retry decision', done: null, created: at(4) },
  ],
  errors: {},
  health: healthy,
  problems: [],
  polled_at: at(0),
};

/** The whole-window snapshots, one per state of the story. */
export const appStorybookMock = {
  default: filled,
  empty: { ...filled, turn: [], feed: [], todos: [], counts: { mine: 0, others: 0, failing: 0, done: 0 }, workspace: { ...workspace, open_moves: 0 } },
  'first run': { ...filled, workspace: { ...workspace, connectors: [], open_moves: 0 }, turn: [], feed: [], todos: [], counts: { mine: 0, others: 0, failing: 0, done: 0 } },
  'source failing': {
    ...filled,
    counts: { ...(filled.counts as Snapshot['counts']), failing: 1 },
    errors: { github: 'Bad credentials' },
    health: { ok: false, stale: false, fresh_at: at(1), failing: [{ source: 'github', polls: 3 }], alerts: [] },
  },
} satisfies Record<string, Partial<Snapshot>>;
