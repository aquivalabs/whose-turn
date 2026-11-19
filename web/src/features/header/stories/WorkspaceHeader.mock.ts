import type { Snapshot } from '@/lib/types.ts';

const workspace: Snapshot['workspace'] = {
  id: 'demo',
  name: 'Demo',
  connectors: [
    { id: 'github', type: 'github', label: 'GitHub' },
    { id: 'tracker', type: 'jira', label: 'Tracker' },
  ],
  links: [
    { label: 'Board', url: 'https://example.com/your-org/board' },
    { label: 'Repo', url: 'https://example.com/your-org/your-repo' },
  ],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
};

const now = () => new Date().toISOString();
const healthy: Snapshot['health'] = { ok: true, stale: false, fresh_at: now(), failing: [], alerts: [] };

/** The snapshot slices the header reads, one per state of the story. */
export const workspaceHeaderStorybookMock = {
  default: { workspace, counts: { mine: 3, others: 5, failing: 1, done: 12 }, health: healthy, polled_at: now() },
  quiet: { workspace, counts: { mine: 0, others: 0, failing: 0, done: 0 }, health: healthy, polled_at: now() },
  'sources down': {
    workspace,
    counts: { mine: 0, others: 0, failing: 0, done: 0 },
    health: { ok: false, stale: false, fresh_at: now(), failing: [{ source: 'github', polls: 3 }, { source: 'tracker', polls: 3 }], alerts: [] },
    polled_at: now(),
  },
} satisfies Record<string, Partial<Snapshot>>;
