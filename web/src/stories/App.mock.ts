import type { Snapshot, TurnRow } from '@/lib/types.ts';
import { demoRow, demoWorkspace, emptyMarks, failingHealth, healthy, hoursAgo } from './fixtures.ts';

const workspace = demoWorkspace({ links: [{ label: 'Board', url: 'https://example.com/board' }], open_moves: 2 });
const other = demoWorkspace({ id: 'side', name: 'Side project', open_moves: 0 });

const row = (key: string, group: TurnRow['group'], rank: number, patch: Partial<TurnRow>): TurnRow =>
  demoRow(key, { ticket_url: `https://example.com/browse/${key}`, group, rank, updated: hoursAgo(rank + 1), status: 'In Progress', ...patch });

const turn: TurnRow[] = [
  row('PROJ-12', 'you', 1, { summary: 'Item — rising', next: 'Reply to the question', comment: 'Could you take another look at the retry?' }),
  row('PROJ-13', 'you', 2, { summary: 'Item — steady', status: 'Code Review', next: 'Review the change' }),
  row('PROJ-14', 'others', 3, { summary: 'Item — falling', status: 'QA', next: 'Waiting for dana', whose: 'dana' }),
  row('PROJ-9', 'done', 4, { summary: 'Item — settled', status: 'Done', next: '' }),
];

const feed: Snapshot['feed'] = [
  { id: 'e1', ref: 'PROJ-12', key: 'PROJ-12', title: 'Item — rising', kind: 'comment', who: 'dana', at: hoursAgo(0.2), text: 'Could you take another look at the retry?', source: 'github' },
  { id: 'e2', ref: 'PROJ-13', key: 'PROJ-13', title: 'Item — steady', kind: 'review', who: 'lee', at: hoursAgo(1), text: 'Approved', source: 'github' },
  { id: 'e3', ref: 'PROJ-14', key: 'PROJ-14', title: 'Item — falling', kind: 'status', who: 'sam', at: hoursAgo(3), text: 'In Progress → QA', source: 'tracker' },
];

const filled: Partial<Snapshot> = {
  workspaces: [workspace, other],
  workspace,
  turn,
  feed,
  marks: emptyMarks({ seen: ['e3'] }),
  counts: { mine: 2, others: 1, failing: 0, done: 1 },
  todos: [
    { id: 't1', text: 'Reply to the question on PROJ-12', done: null, created: hoursAgo(0.5), key: 'PROJ-12', ticket_url: 'https://example.com/browse/PROJ-12' },
    { id: 't2', text: 'Write down the retry decision', done: null, created: hoursAgo(4) },
  ],
  errors: {},
  health: healthy(),
  problems: [],
  polled_at: hoursAgo(0),
};

const nothing = { turn: [], feed: [], todos: [], counts: { mine: 0, others: 0, failing: 0, done: 0 } };

/** The whole-window snapshots, one per state of the story. */
export const appStorybookMock = {
  default: filled,
  empty: { ...filled, ...nothing, workspace: { ...workspace, open_moves: 0 } },
  'first run': { ...filled, ...nothing, workspace: { ...workspace, connectors: [], open_moves: 0 } },
  'source failing': {
    ...filled,
    counts: { ...(filled.counts as Snapshot['counts']), failing: 1 },
    errors: { github: 'Bad credentials' },
    health: failingHealth('github'),
  },
} satisfies Record<string, Partial<Snapshot>>;
