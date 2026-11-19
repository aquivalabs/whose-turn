import type { Snapshot, TurnRow } from '@/lib/types.ts';
import { demoRow, demoWorkspace, emptyMarks, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace();

const row = (id: number, patch: Partial<TurnRow>): TurnRow =>
  demoRow(`PROJ-${id}`, {
    summary: `Item ${id}`,
    ticket_url: `https://example.com/browse/PROJ-${id}`,
    rank: id,
    updated: hoursAgo(id),
    activity_at: hoursAgo(id),
    status: 'In Progress',
    next: 'Reply to the question',
    ...patch,
  });

const turn: TurnRow[] = [
  row(12, { summary: 'Item — rising', next: 'Answer the review comment', why: 'dana asked for another look at the retry', pr: '#41', pr_url: 'https://example.com/your-org/your-repo/pull/41', checks: 'passing', comment: 'Could you take another look?', activity_at: hoursAgo(30) }),
  row(14, { summary: 'Item — steady', next: 'Merge the approved PR', why: 'Approved by lee', pr: '#44', pr_url: 'https://example.com/your-org/your-repo/pull/44', checks: 'running', status: 'Code Review', status_group: 'code_review' }),
  row(15, { summary: 'Item — falling', next: 'Fix the failing build', pr: '#45', pr_url: 'https://example.com/your-org/your-repo/pull/45', checks: 'failing' }),
  row(16, { summary: 'Item — handled', handled: true, next: 'Reply to the question' }),
  row(17, { summary: 'Item — passed on', handled: true, next: 'Ask for a review' }),
  row(8, { summary: 'Item — shipped', group: 'done', status: 'Done', status_since: hoursAgo(5) }),
  row(9, { summary: 'Item — released', group: 'done', status: 'Released', status_since: hoursAgo(48) }),
  row(10, { summary: 'Item — closed', group: 'done', status: 'Done', status_since: hoursAgo(100) }),
];

const marks = emptyMarks({
  handled: { 'PROJ-16': hoursAgo(2), 'PROJ-17': hoursAgo(3) },
  info: {
    'PROJ-16': { note: 'Waiting for the answer on Monday' },
    'PROJ-17': { auto: true, outcome: 'Passed to dana, moved to Code Review', detail: { what: 'Passed to dana', assignee: 'dana', status: 'Code Review' } },
  },
});

/** The snapshot slices the Your move island reads, one per state of the story. */
export const yourMoveStorybookMock = {
  default: { workspace, turn, marks },
  empty: { workspace, turn: [], marks: emptyMarks() },
  failing: { workspace, turn, marks },
} satisfies Record<string, Partial<Snapshot>>;
