import type { Snapshot, Todo } from '@/lib/types.ts';
import { demoWorkspace, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace({ connectors: [{ id: 'tracker', type: 'jira', label: 'Tracker' }] });

const open: Todo[] = [
  { id: 't1', text: 'Reply to the question on PROJ-12', done: null, created: hoursAgo(0.5), key: 'PROJ-12', ticket_url: 'https://example.com/browse/PROJ-12' },
  { id: 't2', text: 'Write down the retry decision', done: null, created: hoursAgo(4) },
  { id: 't3', text: 'Ask for a review of the sample change', done: null, by: 'claude', created: hoursAgo(26) },
];

const finished: Todo[] = [
  { id: 't4', text: 'Close out PROJ-9', done: hoursAgo(2), created: hoursAgo(30), key: 'PROJ-9', ticket_url: 'https://example.com/browse/PROJ-9' },
  { id: 't5', text: 'Update the release notes', done: hoursAgo(20), created: hoursAgo(50) },
];

/** The snapshot slices the to-do island reads, one per state of the story. */
export const todosStorybookMock = {
  default: { workspace, todos: open.concat(finished) },
  empty: { workspace, todos: [] },
  failing: { workspace, todos: open.concat(finished) },
} satisfies Record<string, Partial<Snapshot>>;
