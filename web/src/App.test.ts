import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import { turnRow } from '@/test-rows.ts';
import App from './App.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
  snapshot.workspace = { ...snapshot.workspace, id: 'nw', connectors: [{ type: 'github' }] } as typeof snapshot.workspace;
  snapshot.turn = [turnRow('nw-1', true)];
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
