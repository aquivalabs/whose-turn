import type { Snapshot, Workspace } from '@/lib/types.ts';

const minute = 60 * 1000;
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * minute).toISOString();

const workspace: Workspace = {
  id: 'demo',
  name: 'Demo',
  connectors: [
    { id: 'tracker', type: 'jira', label: 'Tracker' },
    { id: 'code', type: 'github', label: 'Code' },
  ],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
};

const base = { workspace, polled_at: at(1), notifications: { desktop: true } };
const health = { ok: true, stale: false, fresh_at: at(1), failing: [], alerts: [] };

/** The snapshot slices the status line reads, one per state of the story. */
export const statusBarStorybookMock = {
  default: { ...base, health },
  oneSourceFailing: { ...base, health: { ...health, failing: [{ source: 'tracker', polls: 4 }] } },
  noData: {
    ...base,
    health: { ...health, failing: [{ source: 'tracker', polls: 6 }, { source: 'code', polls: 6 }], fresh_at: at(40) },
  },
  stale: { ...base, health: { ...health, stale: true, fresh_at: at(25) } },
} satisfies Record<string, Partial<Snapshot>>;
