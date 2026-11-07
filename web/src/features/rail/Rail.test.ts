import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { snapshot } from '@/store.ts';
import type { Workspace } from '@/lib/types.ts';
import Rail from './Rail.vue';


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
  vi.unstubAllGlobals();
});

const appRoot = Object.assign(document.createElement('div'), { className: 'app' });
const inApp = () => {
  document.body.appendChild(appRoot);
  return {};
};

const sent: string[] = [];
const stubServer = () => {
  sent.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      sent.push(url);
      return Promise.resolve(new Response(JSON.stringify({ lifecycle: 'restarting' }), { status: 200 }));
    }),
  );
};

test('the power button opens Restart and Quit with a note on what each does, and Escape closes it (RMA-425)', async () => {
  // Setup
  render(Rail, inApp());
  // Exercise
  await fireEvent.click(screen.getByRole('link', { name: 'Restart or quit' }));
  // Verify
  expect(await screen.findByRole('menu', { name: 'Restart or quit' })).toBeTruthy();
  expect(screen.getByText(/Restart reloads the monitor/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Restart or quit' }).getAttribute('aria-expanded')).toBe('true');
  await fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

test('Restart in the power menu asks the server to restart at once (RMA-425)', async () => {
  // Setup
  stubServer();
  render(Rail, inApp());
  await fireEvent.click(screen.getByRole('link', { name: 'Restart or quit' }));
  // Exercise
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Restart' }));
  // Verify
  await waitFor(() => expect(sent).toEqual(['/api/restart']));
});

test('Quit in the power menu asks first, Keep running goes back, and only the second Quit stops the server (RMA-425)', async () => {
  // Setup
  stubServer();
  render(Rail, inApp());
  await fireEvent.click(screen.getByRole('link', { name: 'Restart or quit' }));
  // Exercise
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Quit' }));
  const asked = screen.getByText(/Quit Whose Turn\?/);
  await fireEvent.click(screen.getByRole('menuitem', { name: 'Keep running' }));
  const back = screen.getByText(/Restart reloads the monitor/);
  await fireEvent.click(screen.getByRole('menuitem', { name: 'Quit' }));
  await fireEvent.click(screen.getByRole('menuitem', { name: 'Quit' }));
  // Verify
  expect(asked).toBeTruthy();
  expect(back).toBeTruthy();
  await waitFor(() => expect(sent).toEqual(['/api/quit']));
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
