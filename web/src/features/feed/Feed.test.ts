import type * as Store from '@/store.ts';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { setMarks, snapshot, ui } from '@/store.ts';
import type { FeedItem } from '@/lib/types.ts';
import Feed from './Feed.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
vi.mock('@/store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Store>()),
  setMarks: vi.fn(),
}));

test('a stream reconnect clears the line of a refused Mark all read', async () => {
  vi.mocked(setMarks).mockResolvedValue('The local server is not answering.');
  render(Feed);
  await fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
  await screen.findByRole('alert');

  ui.reconnects++;

  await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test('Mark all read offers Undo, which takes back the ids it marked and the old base', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  snapshot.marks = { seen: ['old'], base: 123, handled: {} };
  snapshot.feed = [
    { id: 'old', source: 's', at: '2026-11-02T10:00:00Z' },
    { id: 'fresh', source: 's', at: '2026-11-02T11:00:00Z' },
  ] as FeedItem[];
  render(Feed);

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

  expect(setMarks).toHaveBeenLastCalledWith({ unseen: ['fresh'], base: 123 });
});
