import type { Snapshot } from '@/lib/types.ts';

const hour = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour).toISOString();

const workspace: Snapshot['workspace'] = {
  id: 'demo',
  name: 'Demo',
  connectors: [
    { id: 'github', type: 'github', label: 'GitHub' },
    { id: 'tracker', type: 'jira', label: 'Tracker' },
  ],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
};

const feed: Snapshot['feed'] = [
  { id: 'e1', ref: 'PROJ-12', key: 'PROJ-12', title: 'Item — rising', kind: 'comment', who: 'dana', at: at(0.2), text: 'Could you take another look at the retry?', source: 'github' },
  { id: 'e2', ref: 'PROJ-12', key: 'PROJ-12', title: 'Item — rising', kind: 'review', who: 'lee', at: at(1), text: 'Approved', source: 'github' },
  { id: 'e3', ref: 'PROJ-14', key: 'PROJ-14', title: 'Item — steady', kind: 'status', who: 'sam', at: at(3), text: 'In Progress → Code Review', source: 'tracker' },
  { id: 'e4', ref: 'PROJ-14', key: 'PROJ-14', title: 'Item — steady', kind: 'comment', who: 'sam', at: at(5), text: 'Moved the date to Friday.', source: 'tracker' },
  { id: 'e5', ref: 'PROJ-15', key: 'PROJ-15', title: 'Item — falling', kind: 'check', who: 'ci', at: at(8), text: 'build failed', source: 'github' },
];

const healthy: Snapshot['health'] = { ok: true, stale: false, fresh_at: at(0), failing: [], alerts: [] };

/** The snapshot slices the feed reads, one per state of the story. */
export const feedStorybookMock = {
  default: { workspace, feed, turn: [], marks: { seen: ['e3', 'e4', 'e5'], base: 0, handled: {}, info: {} }, health: healthy, polled_at: at(0) },
  empty: { workspace, feed: [], turn: [], marks: { seen: [], base: 0, handled: {}, info: {} }, health: healthy, polled_at: at(0) },
  failing: {
    workspace,
    feed: [],
    turn: [],
    marks: { seen: [], base: 0, handled: {}, info: {} },
    health: { ok: false, stale: false, fresh_at: at(1), failing: [{ source: 'github', polls: 3 }], alerts: [] },
    polled_at: at(0),
  },
} satisfies Record<string, Partial<Snapshot>>;
