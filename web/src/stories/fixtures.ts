// docs/mechanisms/storybook.md
import type { Health, Snapshot, TurnRow, Workspace } from '@/lib/types.ts';

type SnapshotMarks = Snapshot['marks'];

const MINUTE = 60 * 1000;

/** An ISO time the given number of minutes before now. */
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();

/** An ISO time the given number of hours before now. */
export const hoursAgo = (hours: number) => minutesAgo(hours * 60);

/** The demo workspace with a GitHub and a tracker source; pass the fields a story changes. */
export const demoWorkspace = (patch: Partial<Workspace> = {}): Workspace => ({
  id: 'demo',
  name: 'Demo',
  connectors: [
    { id: 'github', type: 'github', label: 'GitHub' },
    { id: 'tracker', type: 'jira', label: 'Tracker' },
  ],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
  ...patch,
});

/** Health with every source answering, fresh now. */
export const healthy = (): Health => ({ ok: true, stale: false, fresh_at: hoursAgo(0), failing: [], alerts: [] });

/** Health with the named sources failing for three polls, last fresh an hour ago. */
export const failingHealth = (...sources: string[]): Health => ({
  ok: false,
  stale: false,
  fresh_at: hoursAgo(1),
  failing: sources.map((source) => ({ source, polls: 3 })),
  alerts: [],
});

/** Read and handled marks with nothing marked; pass the fields a story sets. */
export const emptyMarks = (patch: Partial<SnapshotMarks> = {}): SnapshotMarks => ({ seen: [], base: 0, handled: {}, info: {}, ...patch });

/** A Your move row two hours old; pass the fields a story changes. */
export const demoRow = (key: string, patch: Partial<TurnRow> = {}): TurnRow => ({
  row_id: key.toLowerCase(),
  key,
  summary: 'Item — steady',
  ticket_url: `https://tracker.example/${key}`,
  group: 'you',
  rank: 3,
  updated: hoursAgo(2),
  activity_at: hoursAgo(2),
  status: 'In review',
  next: 'Review it',
  ...patch,
});
