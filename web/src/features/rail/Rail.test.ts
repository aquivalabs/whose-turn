import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { snapshot } from '@/store.ts';
import type { Workspace } from '@/lib/types.ts';
import Rail from './Rail.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

const workspace = (id: string, extra: Partial<Workspace> = {}): Workspace => ({
  id,
  name: id.toUpperCase(),
  connectors: [],
  links: [],
  key_pattern: '',
  theme: null,
  ...extra,
});

afterEach(() => {
  snapshot.workspaces = [];
});

test('parked and paused workspaces leave the rail and the bottom line counts them as hidden, with the split in its hint', () => {
  snapshot.workspaces = [
    workspace('a'),
    workspace('b', { hidden: 'parked' }),
    workspace('c', { hidden: 'parked' }),
    workspace('d', { hidden: 'paused' }),
  ];

  render(Rail);

  expect(screen.getByRole('link', { name: 'A' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'B' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'D' })).toBeNull();
  expect(screen.getByRole('link', { name: '3 hidden' }).getAttribute('data-tip')).toBe(
    'Hidden workspaces: 2 parked · 1 paused. Open to bring one back.',
  );
});

test('the line is absent when nothing is hidden, and a parked-only rail reads "1 hidden"', () => {
  snapshot.workspaces = [workspace('a')];
  const first = render(Rail);
  expect(screen.queryByRole('link', { name: /parked|paused/ })).toBeNull();
  first.unmount();

  snapshot.workspaces = [workspace('a'), workspace('b', { hidden: 'parked' })];
  render(Rail);
  expect(screen.getByRole('link', { name: '1 hidden' })).toBeTruthy();
});

test('the line opens the monitor settings, and a workspace that came back wears the unseen dot', async () => {
  snapshot.workspaces = [workspace('a', { returned: true }), workspace('b', { hidden: 'paused' })];
  const view = render(Rail);

  expect(screen.getByTitle('Back in the rail: something needs you')).toBeTruthy();
  await fireEvent.click(screen.getByRole('link', { name: '1 hidden' }));

  expect(view.emitted().settings).toHaveLength(1);
});
