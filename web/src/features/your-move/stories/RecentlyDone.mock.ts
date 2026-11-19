import type { Snapshot, TurnRow } from '@/lib/types.ts';

const hour = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour).toISOString();

const workspace: Snapshot['workspace'] = {
  id: 'demo',
  name: 'Demo',
  connectors: [{ id: 'tracker', type: 'jira', label: 'Tracker' }],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
};

const done = (id: number, status: string, hoursAgo: number): TurnRow => ({
  row_id: `PROJ-${id}`,
  key: `PROJ-${id}`,
  summary: `Item ${id} — ${status.toLowerCase()}`,
  ticket_url: `https://example.com/browse/PROJ-${id}`,
  group: 'done',
  rank: id,
  updated: at(hoursAgo),
  status,
  status_since: at(hoursAgo),
  next: '',
});

/** The snapshot slices the Recently done block reads, one per state of the story. */
export const recentlyDoneStorybookMock = {
  default: { workspace, turn: [done(8, 'Done', 5), done(9, 'Released', 48), done(10, 'Done', 100), done(11, 'Released', 200)] },
  empty: { workspace, turn: [] },
} satisfies Record<string, Partial<Snapshot>>;
