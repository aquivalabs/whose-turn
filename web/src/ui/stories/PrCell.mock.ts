import type { TurnRow } from '@/lib/types.ts';

const base: TurnRow = {
  row_id: 'r1',
  key: 'PROJ-12',
  summary: 'Item — rising',
  ticket_url: 'https://example.com/browse/PROJ-12',
  group: 'you',
  rank: 1,
  updated: '2026-01-01T10:00:00Z',
  status: 'In review',
  next: 'Review',
  pr: 'your-org/your-repo#42',
  pr_url: 'https://example.com/your-org/your-repo/pull/42',
  pr_state: 'OPEN',
  checks: 'passing',
};

export const prCellStorybookMock: Record<string, TurnRow> = {
  passing: base,
  running: { ...base, checks: 'running' },
  failing: { ...base, checks: 'failing' },
  merged: { ...base, pr_state: 'MERGED', checks: undefined },
  closed: { ...base, pr_state: 'CLOSED', checks: undefined },
  none: { ...base, pr: undefined, pr_url: undefined, pr_state: undefined, checks: undefined },
};
