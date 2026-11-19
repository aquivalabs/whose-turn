import type { Snapshot, TurnRow } from '@/lib/types.ts';
import { demoRow, demoWorkspace, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace({ connectors: [{ id: 'tracker', type: 'jira', label: 'Tracker' }] });

const done = (id: number, status: string, hours: number): TurnRow =>
  demoRow(`PROJ-${id}`, {
    summary: `Item ${id} — ${status.toLowerCase()}`,
    ticket_url: `https://example.com/browse/PROJ-${id}`,
    group: 'done',
    rank: id,
    updated: hoursAgo(hours),
    status,
    status_since: hoursAgo(hours),
    next: '',
  });

/** The snapshot slices the Recently done block reads, one per state of the story. */
export const recentlyDoneStorybookMock = {
  default: { workspace, turn: [done(8, 'Done', 5), done(9, 'Released', 48), done(10, 'Done', 100), done(11, 'Released', 200)] },
  empty: { workspace, turn: [] },
} satisfies Record<string, Partial<Snapshot>>;
