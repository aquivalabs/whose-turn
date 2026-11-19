import type { Snapshot } from '@/lib/types.ts';
import { demoWorkspace, failingHealth, healthy, minutesAgo } from '@/stories/fixtures.ts';

const base = {
  workspace: demoWorkspace({
    connectors: [
      { id: 'tracker', type: 'jira', label: 'Tracker' },
      { id: 'code', type: 'github', label: 'Code' },
    ],
  }),
  polled_at: minutesAgo(1),
  notifications: { desktop: true },
};
const fresh = { ...healthy(), fresh_at: minutesAgo(1) };

/** The snapshot slices the status line reads, one per state of the story. */
export const statusBarStorybookMock = {
  default: { ...base, health: fresh },
  oneSourceFailing: { ...base, health: { ...failingHealth('tracker'), fresh_at: minutesAgo(1) } },
  noData: { ...base, health: { ...failingHealth('tracker', 'code'), fresh_at: minutesAgo(40) } },
  stale: { ...base, health: { ...fresh, stale: true, fresh_at: minutesAgo(25) } },
} satisfies Record<string, Partial<Snapshot>>;
