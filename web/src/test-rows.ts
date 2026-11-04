import type { TurnRow } from '@/lib/types.ts';

/** A Your move row for component tests. */
export const turnRow = (id: string, handled = false): TurnRow => ({
  row_id: id,
  key: id.toUpperCase(),
  summary: 'Summary of ' + id,
  ticket_url: 'https://tracker.example/' + id,
  group: 'you',
  rank: 1,
  updated: '2026-11-02T10:00:00Z',
  activity_at: '2026-11-02T10:00:00Z',
  status: 'In review',
  handled,
  next: 'Review ' + id,
});
