import type * as Store from '@/store.ts';
import { nextTick } from 'vue';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { setMarks, snapshot, ui } from '@/store.ts';
import type { FeedItem } from '@/lib/types.ts';
import Feed from './Feed.vue';
import { useFeedState } from './useFeedState.ts';

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
  snapshot.marks = { seen: ['old'], base: 123, handled: {}, info: {} };
  snapshot.feed = [
    { id: 'old', source: 's', at: '2026-11-02T10:00:00Z' },
    { id: 'fresh', source: 's', at: '2026-11-02T11:00:00Z' },
  ] as FeedItem[];
  render(Feed);

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

  expect(setMarks).toHaveBeenLastCalledWith({ unseen: ['fresh'], base: 123 });
});

test('the feed search clears when the open workspace changes', async () => {
  snapshot.workspace = { ...snapshot.workspace, id: 'home' };
  render(Feed);
  useFeedState().query = 'NW-137';
  await nextTick();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('NW-137');

  snapshot.workspace = { ...snapshot.workspace, id: 'atlas' };
  await nextTick();
  await nextTick();

  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
});

test('typing in the feed search filters 150 ms after the last keystroke, not on every key', async () => {
  vi.useFakeTimers();
  try {
    snapshot.feed = [
      { id: 'a', source: 's', key: 'NW-1', at: '2026-11-02T10:00:00Z' },
      { id: 'b', source: 's', key: 'NW-2', at: '2026-11-02T11:00:00Z' },
    ] as FeedItem[];
    useFeedState().query = '';
    render(Feed);
    const box = screen.getByRole('searchbox') as HTMLInputElement;

    await fireEvent.update(box, 'NW-');
    await fireEvent.update(box, 'NW-2');
    vi.advanceTimersByTime(149);
    expect(useFeedState().query).toBe('');

    vi.advanceTimersByTime(1);
    expect(useFeedState().query).toBe('NW-2');
  } finally {
    vi.useRealTimers();
  }
});

test('the unread count of the folded strip sits in the strip, where it is written top to bottom', async () => {
  localStorage.setItem('wt-collapsed', JSON.stringify(['feed']));
  snapshot.marks = { seen: [], base: 0, handled: {}, info: {} };
  snapshot.feed = [{ id: 'fresh', source: 's', at: '2999-01-01T00:00:00Z' }] as FeedItem[];
  const { container } = render(Feed);

  await screen.findAllByText('1 new');

  expect(container.querySelector('.island--strip .feed__new-count')?.textContent).toBe('1 new');
  localStorage.clear();
});
