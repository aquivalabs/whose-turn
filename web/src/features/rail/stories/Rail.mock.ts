import type { Snapshot, Workspace } from '@/lib/types.ts';

const workspace = (id: string, name: string, change: Partial<Workspace> = {}): Workspace => ({
  id,
  name,
  connectors: [{ id: 'tracker', type: 'jira', label: 'Tracker' }],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
  ...change,
});

const demo = workspace('demo', 'Demo', { open_moves: 3 });
const side = workspace('side', 'Side project', { open_moves: 12 });
const ops = workspace('ops', 'Operations', { failing_sources: 1 });
const archive = workspace('archive', 'Archive', { hidden: 'parked', returned: true });
const idle = workspace('idle', 'Idle team', { hidden: 'paused' });

/** The snapshot slices the rail reads, one per state of the story. */
export const railStorybookMock = {
  default: { workspace: demo, workspaces: [demo, side, ops] },
  single: { workspace: demo, workspaces: [demo] },
  withHidden: { workspace: demo, workspaces: [demo, side, archive, idle] },
  failing: { workspace: demo, workspaces: [demo, ops, side], errors: { tracker: 'Tracker refused the request' } },
} satisfies Record<string, Partial<Snapshot>>;
