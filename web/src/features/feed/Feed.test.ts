import type * as Store from '@/store.ts';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { setMarks, ui } from '@/store.ts';
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
