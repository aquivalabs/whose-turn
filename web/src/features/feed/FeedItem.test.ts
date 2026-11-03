import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import type { FeedItem } from '@/lib/types.ts';
import FeedItemRow from './FeedItem.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

const item: FeedItem = {
  id: 'c1',
  ref: 'PROJ-7',
  kind: 'comment',
  who: 'Pat',
  at: '2026-11-02T10:00:00Z',
  body: 'please look',
  url: 'https://tracker.example/PROJ-7',
  source: 'tracker',
};
const source = { id: 'tracker', type: 'demo', label: 'Tracker' };

test('expanding a fresh comment asks the feed to toggle it and mark it seen', async () => {
  const { emitted } = render(FeedItemRow, {
    props: { item, source, fresh: true, expanded: false },
  });

  await fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

  expect(emitted().toggle).toEqual([['c1']]);
  expect(emitted().seen).toEqual([['c1']]);
});

test('a read item asks for nothing when clicked, and shows its body only when expanded', async () => {
  const { emitted, rerender } = render(FeedItemRow, {
    props: { item, source, fresh: false, expanded: false },
  });

  await fireEvent.click(screen.getByText('PROJ-7').closest('li')!);

  expect(emitted().seen).toBeUndefined();
  expect(screen.queryByText('please look')).toBeNull();
  await rerender({ item, source, fresh: false, expanded: true });
  expect(screen.getByText('please look')).toBeTruthy();
});
