import type * as Store from '@/store.ts';
import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { snapshot } from '@/store.ts';
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
