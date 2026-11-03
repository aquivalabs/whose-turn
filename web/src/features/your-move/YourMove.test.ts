import type * as Store from '@/store.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { setMarks, snapshot, ui } from '@/store.ts';
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

test('the PR and Last comment columns are left out while every row is empty in them', async () => {
  render(YourMove);
  await screen.findByText('Review nw-1');

  expect(screen.queryByRole('columnheader', { name: 'PR' })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Last comment' })).toBeNull();
});

test('a PR row without a ticket links the PR from the ticket column and leaves the PR column out', async () => {
  snapshot.turn = [
    { ...row('nw-3', false), key: 'repo#7', ticket_url: '', pr: 'repo#7', pr_url: 'https://host.example/pull/7' },
  ];
  render(YourMove);

  const link = await screen.findByRole('link', { name: 'repo#7' });

  expect(link.getAttribute('href')).toBe('https://host.example/pull/7');
  expect(screen.getAllByRole('link', { name: 'repo#7' })).toHaveLength(1);
  expect(screen.queryByRole('columnheader', { name: 'PR' })).toBeNull();
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

test('a stream reconnect clears the problem lines of refused rows', async () => {
  vi.mocked(setMarks).mockResolvedValue('The local server is not answering.');
  render(YourMove);
  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));
  await screen.findByRole('alert');

  ui.reconnects++;

  await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test('Handled offers Undo for a moment, and Undo moves the row back', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render(YourMove);

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

  expect(setMarks).toHaveBeenLastCalledWith({ handled: { 'nw-1': null } });
});
