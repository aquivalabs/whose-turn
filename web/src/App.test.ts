import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import { turnRow } from '@/test-rows.ts';
import App from './App.vue';


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

test('folding What changed narrows its column to a strip that keeps the unread count', async () => {
  localStorage.clear();
  const { container } = render(App);
  const layout = container.querySelector('.dashboard__layout') as HTMLElement;
  expect(layout.classList.contains('dashboard__layout--feed-folded')).toBe(false);

  await fireEvent.click(screen.getByRole('button', { name: 'Fold What changed' }));

  await waitFor(() => expect(layout.classList.contains('dashboard__layout--feed-folded')).toBe(true));
  expect(screen.getByRole('button', { name: 'Open What changed' }).getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('.feed.island--strip')).not.toBeNull();

  await fireEvent.click(container.querySelector('.feed .island__head') as HTMLElement);

  await waitFor(() => expect(layout.classList.contains('dashboard__layout--feed-folded')).toBe(false));
  localStorage.clear();
});
