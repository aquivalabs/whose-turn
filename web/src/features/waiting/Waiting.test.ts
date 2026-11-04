import type * as Store from '@/store.ts';
import { expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import { render, screen } from '@testing-library/vue';
import { snapshot } from '@/store.ts';
import { exits } from '@/test-motion.ts';
import type { TurnRow } from '@/lib/types.ts';
import Waiting from './Waiting.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
vi.mock('@/store.ts', async (importOriginal) => ({ ...(await importOriginal<typeof Store>()) }));

const backlogRow: TurnRow = {
  row_id: 'b-1',
  key: 'B-1',
  summary: 'Plan it',
  ticket_url: 'https://tracker.example/b-1',
  group: 'others',
  whose: 'maria',
  rank: 3,
  updated: '2026-11-02T10:00:00Z',
  activity_at: '2026-11-02T10:00:00Z',
  status: 'Backlog',
  status_group: 'backlog',
  next: 'Backlog',
};

test('backlog rows listed under Waiting on others say "you" and leave Waiting for empty', () => {
  snapshot.turn = [backlogRow];
  render(Waiting);

  expect(screen.getByText('Your backlog')).toBeTruthy();
  expect(screen.getByText('you')).toBeTruthy();
  expect(screen.queryByText('maria')).toBeNull();
});

test('a row waiting on reviewers lists every one, marks who approved and who asked for changes, and lets the list wrap', () => {
  snapshot.turn = [
    {
      ...backlogRow,
      row_id: 'r-1',
      key: 'R-1',
      status: 'Code Review',
      status_group: 'code_review',
      whose: 'sam, ✓ ann, ✗ bob, core, cy, di, ed',
      reviewers: [
        { name: 'sam', state: '' },
        { name: 'ann', state: 'approved' },
        { name: 'bob', state: 'changes' },
        { name: 'core', state: '' },
        { name: 'cy', state: '' },
        { name: 'di', state: '' },
        { name: 'ed', state: '' },
      ],
    },
  ];
  const { container } = render(Waiting);

  const listed = [...container.querySelectorAll('.waiting__reviewer')];
  expect(listed.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
    'sam',
    '✓ approved by ann',
    '✗ changes requested by bob',
    'core',
    'cy',
    'di',
    'ed',
  ]);
  expect(container.textContent).not.toContain('+');
  expect([...container.querySelectorAll('.waiting__mark')].map((mark) => mark.textContent)).toEqual(['✓', '✗']);
});

test('the last row leaving Waiting on others fades the list out first and shows the empty text after', async () => {
  snapshot.turn = [backlogRow];
  exits.hold();
  const { container } = render(Waiting);
  expect(screen.queryByText('Nothing is waiting on someone else.')).toBeNull();

  snapshot.turn = [];
  await nextTick();

  expect(container.querySelector('.waiting__table')).not.toBeNull();
  expect(screen.queryByText('Nothing is waiting on someone else.')).toBeNull();

  exits.release();

  await screen.findByText('Nothing is waiting on someone else.');
  expect(container.querySelector('.waiting__table')).toBeNull();
});

test('a row leaving Waiting on others is marked while it is still in the page', async () => {
  snapshot.turn = [backlogRow, { ...backlogRow, row_id: 'b-2', key: 'B-2' }];
  exits.hold();
  const { container } = render(Waiting);

  snapshot.turn = [backlogRow];
  await nextTick();

  expect(container.querySelectorAll('.waiting__table tbody')).toHaveLength(2);
  expect(container.querySelectorAll('.waiting__table tbody[data-leaving]')).toHaveLength(1);
});
