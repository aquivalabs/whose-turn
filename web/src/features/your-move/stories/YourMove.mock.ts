import type { Snapshot, TurnRow } from '@/lib/types.ts';

const hour = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour).toISOString();

const workspace: Snapshot['workspace'] = {
  id: 'demo',
  name: 'Demo',
  connectors: [
    { id: 'github', type: 'github', label: 'GitHub' },
    { id: 'tracker', type: 'jira', label: 'Tracker' },
  ],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
};

const row = (id: number, patch: Partial<TurnRow>): TurnRow => ({
  row_id: `PROJ-${id}`,
  key: `PROJ-${id}`,
  summary: `Item ${id}`,
  ticket_url: `https://example.com/browse/PROJ-${id}`,
  group: 'you',
  rank: id,
  updated: at(id),
  activity_at: at(id),
  status: 'In Progress',
  next: 'Reply to the question',
  ...patch,
});

const turn: TurnRow[] = [
  row(12, { summary: 'Item — rising', next: 'Answer the review comment', why: 'dana asked for another look at the retry', pr: '#41', pr_url: 'https://example.com/your-org/your-repo/pull/41', checks: 'passing', comment: 'Could you take another look?', activity_at: at(30) }),
  row(14, { summary: 'Item — steady', next: 'Merge the approved PR', why: 'Approved by lee', pr: '#44', pr_url: 'https://example.com/your-org/your-repo/pull/44', checks: 'running', status: 'Code Review', status_group: 'code_review' }),
  row(15, { summary: 'Item — falling', next: 'Fix the failing build', pr: '#45', pr_url: 'https://example.com/your-org/your-repo/pull/45', checks: 'failing' }),
  row(16, { summary: 'Item — handled', handled: true, next: 'Reply to the question' }),
  row(17, { summary: 'Item — passed on', handled: true, next: 'Ask for a review' }),
  row(8, { summary: 'Item — shipped', group: 'done', status: 'Done', status_since: at(5) }),
  row(9, { summary: 'Item — released', group: 'done', status: 'Released', status_since: at(48) }),
  row(10, { summary: 'Item — closed', group: 'done', status: 'Done', status_since: at(100) }),
];

const marks = {
  seen: [],
  base: 0,
  handled: { 'PROJ-16': at(2), 'PROJ-17': at(3) },
  info: {
    'PROJ-16': { note: 'Waiting for the answer on Monday' },
    'PROJ-17': { auto: true, outcome: 'Passed to dana, moved to Code Review', detail: { what: 'Passed to dana', assignee: 'dana', status: 'Code Review' } },
  },
};

const empty = { seen: [], base: 0, handled: {}, info: {} };

/** The snapshot slices the Your move island reads, one per state of the story. */
export const yourMoveStorybookMock = {
  default: { workspace, turn, marks },
  empty: { workspace, turn: [], marks: empty },
  failing: { workspace, turn, marks },
} satisfies Record<string, Partial<Snapshot>>;
