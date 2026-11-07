import { beforeEach, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { snapshot } from '@/store.ts';
import { turnRow } from '@/test-rows.ts';
import type { TurnRow } from '@/lib/types.ts';
import RecentlyDone from './RecentlyDone.vue';

const done = (id: string, at: string): TurnRow => ({
  ...turnRow(id),
  group: 'done',
  status: 'Done',
  status_group: 'passed',
  status_since: at,
});

beforeEach(() => {
  localStorage.clear();
  snapshot.turn = [];
});

test('nothing shows while no ticket is done', () => {
  snapshot.turn = [turnRow('open-1')];
  render(RecentlyDone);

  expect(screen.queryByText('Recently done')).toBeNull();
});

test('done tickets are counted, newest first, and the block starts folded', () => {
  snapshot.turn = [done('old-1', '2026-11-01T10:00:00Z'), turnRow('open-1'), done('new-1', '2026-11-03T10:00:00Z')];
  render(RecentlyDone);

  expect(screen.getByText('Recently done')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  const tickets = screen.getAllByRole('link').map((link) => link.textContent?.trim());
  expect(tickets.indexOf('NEW-1')).toBeLessThan(tickets.indexOf('OLD-1'));
  expect(screen.queryByRole('separator', { name: 'Resize Recently done' })).toBeNull();
});

test('opening the block shows its resize grip and is remembered for the next window', async () => {
  snapshot.turn = [done('new-1', '2026-11-03T10:00:00Z')];
  const first = render(RecentlyDone);

  await fireEvent.click(screen.getByText('Recently done'));

  expect(await screen.findByRole('separator', { name: 'Resize Recently done' })).toBeTruthy();
  expect(localStorage.getItem('wt-recent-open')).toBe('1');
  first.unmount();
  render(RecentlyDone);
  expect(screen.getByRole('separator', { name: 'Resize Recently done' })).toBeTruthy();
});

test('folding it again hides the grip and remembers the fold', async () => {
  localStorage.setItem('wt-recent-open', '1');
  snapshot.turn = [done('new-1', '2026-11-03T10:00:00Z')];
  render(RecentlyDone);

  await fireEvent.click(screen.getByText('Recently done'));

  expect(screen.queryByRole('separator', { name: 'Resize Recently done' })).toBeNull();
  expect(localStorage.getItem('wt-recent-open')).toBe('0');
});
