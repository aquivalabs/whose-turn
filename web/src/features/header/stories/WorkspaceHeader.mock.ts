import type { Snapshot } from '@/lib/types.ts';
import { demoWorkspace, failingHealth, healthy, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace({
  links: [
    { label: 'Board', url: 'https://example.com/your-org/board' },
    { label: 'Repo', url: 'https://example.com/your-org/your-repo' },
  ],
});

const none = { mine: 0, others: 0, failing: 0, done: 0 };

/** The snapshot slices the header reads, one per state of the story. */
export const workspaceHeaderStorybookMock = {
  default: { workspace, counts: { mine: 3, others: 5, failing: 1, done: 12 }, health: healthy(), polled_at: hoursAgo(0) },
  quiet: { workspace, counts: none, health: healthy(), polled_at: hoursAgo(0) },
  'sources down': { workspace, counts: none, health: { ...failingHealth('github', 'tracker'), fresh_at: hoursAgo(0) }, polled_at: hoursAgo(0) },
} satisfies Record<string, Partial<Snapshot>>;
