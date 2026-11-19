import type { Snapshot, TurnRow } from '@/lib/types.ts';
import { demoRow, demoWorkspace, emptyMarks, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace({ connectors: [{ id: 'tracker', type: 'jira', label: 'Tracker' }] });

const row = (id: number, summary: string): TurnRow =>
  demoRow(`PROJ-${id}`, { row_id: `PROJ-${id}`, summary, ticket_url: `https://example.com/browse/PROJ-${id}`, rank: id, status: 'In Progress', next: 'Reply to the question', handled: true });

const turn = [row(16, 'Item — handled'), row(17, 'Item — passed on')];

const marks = (info: Snapshot['marks']['info']) => emptyMarks({ handled: { 'PROJ-16': hoursAgo(2), 'PROJ-17': hoursAgo(3) }, info });

const feed: Snapshot['feed'] = [
  { id: 'e1', ref: 'PROJ-17', key: 'PROJ-17', title: 'Item — passed on', kind: 'comment', who: 'dana', at: hoursAgo(3), text: 'Could you take another look at the retry?', source: 'tracker' },
];

/** The snapshot slices the note window reads, one per kind of handled row. */
export const noteModalStorybookMock = {
  note: { id: 'PROJ-16', slice: { workspace, turn, feed, marks: marks({ 'PROJ-16': { note: 'Waiting for the answer on Monday' } }) } },
  passedOn: {
    id: 'PROJ-17',
    slice: {
      workspace,
      turn,
      feed,
      marks: marks({
        'PROJ-17': {
          auto: true,
          event: 'e1',
          outcome: 'Passed to dana, moved to Code Review',
          note: 'Checked with dana',
          detail: { what: 'Passed to dana', assignee: 'dana', status: 'Code Review', summary: 'Assignee changed', comment: 'e1' },
        },
      }),
    },
  },
} satisfies Record<string, { id: string; slice: Partial<Snapshot> }>;
