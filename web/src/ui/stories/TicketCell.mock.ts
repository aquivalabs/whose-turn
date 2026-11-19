import type { TurnRow } from '@/lib/types.ts';

const base: TurnRow = {
  row_id: 'r1',
  key: 'PROJ-12',
  summary: 'Item — rising: a short summary of the ticket',
  ticket_url: 'https://example.com/browse/PROJ-12',
  group: 'you',
  rank: 1,
  updated: '2026-01-01T10:00:00Z',
  status: 'In review',
  next: 'Review',
  labels: ['backend', 'urgent'],
  badges: ['urgent'],
};

export const ticketCellStorybookMock: Record<string, TurnRow> = {
  default: base,
  noLabels: { ...base, labels: [], badges: [] },
  longSummary: {
    ...base,
    summary: 'Item — steady: a much longer summary that keeps going so the cell has to wrap it inside its width limit and stay readable',
  },
  prOnly: {
    ...base,
    key: 'your-org/your-repo#42',
    summary: 'Item — falling: a pull request without a ticket',
    ticket_url: '',
    pr: 'your-org/your-repo#42',
    pr_url: 'https://example.com/your-org/your-repo/pull/42',
    labels: [],
  },
};
