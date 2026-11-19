import type { Snapshot, Todo } from '@/lib/types.ts';

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

const open: Todo[] = [
  { id: 't1', text: 'Reply to the question on PROJ-12', done: null, created: at(0.5), key: 'PROJ-12', ticket_url: 'https://example.com/browse/PROJ-12' },
  { id: 't2', text: 'Write down the retry decision', done: null, created: at(4) },
  { id: 't3', text: 'Ask for a review of the sample change', done: null, by: 'claude', created: at(26) },
];

const finished: Todo[] = [
  { id: 't4', text: 'Close out PROJ-9', done: at(2), created: at(30), key: 'PROJ-9', ticket_url: 'https://example.com/browse/PROJ-9' },
  { id: 't5', text: 'Update the release notes', done: at(20), created: at(50) },
];

/** The snapshot slices the to-do island reads, one per state of the story. */
export const todosStorybookMock = {
  default: { workspace, todos: open.concat(finished) },
  empty: { workspace, todos: [] },
  failing: { workspace, todos: open.concat(finished) },
} satisfies Record<string, Partial<Snapshot>>;
