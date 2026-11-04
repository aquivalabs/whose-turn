import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import type { TurnRow } from '@/lib/types.ts';
import App from './App.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

const row = (id: string): TurnRow => ({
  row_id: id,
  key: id.toUpperCase(),
  summary: 'Summary of ' + id,
  ticket_url: 'https://tracker.example/' + id,
  group: 'you',
  rank: 1,
  updated: '2026-11-02T10:00:00Z',
  activity_at: '2026-11-02T10:00:00Z',
  status: 'In review',
  handled: true,
  next: 'Review ' + id,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
  snapshot.workspace = { ...snapshot.workspace, id: 'nw', connectors: [{ type: 'github' }] } as typeof snapshot.workspace;
  snapshot.turn = [row('nw-1')];
  ui.note = '';
});

test('a poll that drops the row of an open note window leaves the window usable', async () => {
  ui.note = 'nw-1';
  const { container } = render(App);
  await screen.findByRole('dialog');

  snapshot.turn = [];

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(container.querySelector('[inert]')).toBeNull();
});
