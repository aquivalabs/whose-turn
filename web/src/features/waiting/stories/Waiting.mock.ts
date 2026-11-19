import type { Snapshot, TurnRow } from '@/lib/types.ts';
import { demoRow, demoWorkspace, emptyMarks, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace();

const row = (id: number, patch: Partial<TurnRow>): TurnRow =>
  demoRow(`PROJ-${id}`, {
    summary: `Item ${id}`,
    ticket_url: `https://example.com/browse/PROJ-${id}`,
    group: 'others',
    rank: id,
    updated: hoursAgo(id),
    status: 'Code Review',
    status_group: 'code_review',
    status_since: hoursAgo(id * 10),
    next: 'Review the change',
    ...patch,
  });

const reviewing = [
  row(21, {
    summary: 'Item — rising',
    whose: 'lee',
    reviewers: [
      { name: 'lee', state: 'approved' },
      { name: 'sam', state: 'changes' },
      { name: 'dana', state: '' },
    ],
    pr: '#51',
    pr_url: 'https://example.com/your-org/your-repo/pull/51',
    checks: 'passing',
  }),
  row(22, { summary: 'Item — steady', whose: 'sam', next: 'Waiting for the vendor to answer', hold_url: 'https://example.com/browse/PROJ-22', hold_full: 'Waiting for the vendor to answer the question about the export format', status: 'On Hold', status_group: 'on_hold' }),
  row(23, { summary: 'Item — falling', whose: 'dana', next: 'Test on staging', status: 'QA', status_group: 'qa', status_since: hoursAgo(100) }),
];

const backlog = [row(24, { summary: 'Item — backlog', status: 'Backlog', status_group: 'backlog', next: '' }), row(25, { summary: 'Item — queued', status: 'Backlog', status_group: 'backlog', next: '' })];

/** The snapshot slices the Waiting island reads, one per state of the story. */
export const waitingStorybookMock = {
  default: { workspace, turn: reviewing, marks: emptyMarks() },
  backlog: { workspace, turn: backlog, marks: emptyMarks() },
  empty: { workspace, turn: [], marks: emptyMarks() },
} satisfies Record<string, Partial<Snapshot>>;
