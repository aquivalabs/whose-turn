import type * as Store from '@/store.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { setMarks, snapshot } from '@/store.ts';
import type { TurnRow } from '@/lib/types.ts';
import YourMove from './YourMove.vue';
import { useMoveView } from './useMoveView.ts';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
vi.mock('@/store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Store>()),
  setMarks: vi.fn(),
}));

const row = (id: string, handled: boolean): TurnRow => ({
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

beforeEach(() => {
  snapshot.turn = [row('nw-1', false), row('nw-2', true)];
  useMoveView().value = 'open';
});

test('Handled sends the id of its row to setMarks', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render(YourMove);

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));

  expect(setMarks).toHaveBeenCalledWith({ handled: { 'nw-1': expect.any(String) } });
});

test('the Handled view lists the handled rows and not the open ones', async () => {
  render(YourMove);
  expect(await screen.findByText('Review nw-1')).toBeTruthy();
  expect(screen.queryByText('Review nw-2')).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: /Handled/ }));

  expect(await screen.findByText('Review nw-2')).toBeTruthy();
  expect(screen.queryByText('Review nw-1')).toBeNull();
});
