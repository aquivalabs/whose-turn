import type { Snapshot } from '@/lib/types.ts';
import { demoWorkspace } from '@/stories/fixtures.ts';

const tracker = { connectors: [{ id: 'tracker', type: 'jira' as const, label: 'Tracker' }] };
const demo = demoWorkspace({ ...tracker, open_moves: 3 });
const side = demoWorkspace({ ...tracker, id: 'side', name: 'Side project', open_moves: 12 });
const ops = demoWorkspace({ ...tracker, id: 'ops', name: 'Operations', failing_sources: 1 });
const archive = demoWorkspace({ ...tracker, id: 'archive', name: 'Archive', hidden: 'parked', returned: true });
const idle = demoWorkspace({ ...tracker, id: 'idle', name: 'Idle team', hidden: 'paused' });

/** The snapshot slices the rail reads, one per state of the story. */
export const railStorybookMock = {
  default: { workspace: demo, workspaces: [demo, side, ops] },
  single: { workspace: demo, workspaces: [demo] },
  withHidden: { workspace: demo, workspaces: [demo, side, archive, idle] },
  failing: { workspace: demo, workspaces: [demo, ops, side], errors: { tracker: 'Tracker refused the request' } },
} satisfies Record<string, Partial<Snapshot>>;
