import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import App from '@/App.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

const reply = {
  settings: { poll_seconds: 60, history_days: 14, stale_minutes: 15, failing_polls: 3 },
  settings_fields: {
    poll_seconds: { label: 'Poll every (seconds)', hint: 'how often' },
    history_days: { label: 'History (days)', hint: 'how far back' },
    stale_minutes: { label: 'Stale after (minutes)', hint: 'alert after' },
    failing_polls: { label: 'Failing polls in a row', hint: 'alert after' },
  },
  config_file: '/data/whose-turn/config.json',
};

let sent: { url: string; body: Record<string, unknown> }[] = [];
const stubServer = (answer: unknown = {}) => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { body?: string }) => {
      if (init?.body) {
        sent.push({ url, body: JSON.parse(init.body) });
        return Promise.resolve({ json: () => Promise.resolve(answer) });
      }
      return url === '/api/config'
        ? Promise.resolve({ json: () => Promise.resolve(reply) })
        : new Promise(() => undefined);
    }),
  );
};

beforeEach(() => {
  snapshot.notifications = { desktop: true };
});

afterEach(() => {
  ui.monitor = false;
  vi.unstubAllGlobals();
});

const openFromRail = async () => {
  render(App);
  await fireEvent.click(screen.getByRole('link', { name: 'Monitor settings' }));
  await screen.findByDisplayValue('60');
};

test('the gear at the bottom of the rail opens the monitor settings with the numbers and the config file', async () => {
  stubServer();

  await openFromRail();

  expect(screen.getByRole('dialog', { name: 'Monitor settings' })).toBeTruthy();
  expect(['60', '14', '15', '3'].every((value) => screen.getByDisplayValue(value))).toBe(true);
  expect(screen.getByText('/data/whose-turn/config.json')).toBeTruthy();
});

test('editing a number marks the sheet unsaved; Save posts the four numbers and closes it', async () => {
  stubServer();
  await openFromRail();

  await fireEvent.update(screen.getByDisplayValue('60'), '30');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Monitor settings' })).toBeNull());
  expect(sent).toEqual([
    {
      url: '/api/config',
      body: { settings: { poll_seconds: 30, history_days: 14, stale_minutes: 15, failing_polls: 3 } },
    },
  ]);
});

test('a refused number stays open and shows the server\'s words under its field', async () => {
  stubServer({
    error: {
      code: 400,
      status: 'INVALID_CONFIG',
      message: 'x',
      details: [
        {
          '@type': 'BadRequest',
          field_violations: [{ field: 'settings.poll_seconds', description: 'poll_seconds must be a positive number.' }],
        },
      ],
    },
  });
  await openFromRail();

  await fireEvent.update(screen.getByDisplayValue('60'), '0');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('poll_seconds must be a positive number.')).toBeTruthy();
  expect(screen.getByRole('dialog', { name: 'Monitor settings' })).toBeTruthy();
});

test('closing with unsaved numbers asks before dropping them', async () => {
  stubServer();
  await openFromRail();
  await fireEvent.update(screen.getByDisplayValue('14'), '7');

  await fireEvent.keyDown(document, { key: 'Escape' });
  await fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
  );

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(sent).toEqual([]);
});

test('the notifications switch saves at once through the same route as the bell', async () => {
  stubServer({ notifications: { desktop: false } });
  await openFromRail();

  await fireEvent.click(screen.getByRole('switch', { name: /Desktop notifications/ }));

  await waitFor(() => expect(sent).toEqual([{ url: '/api/notifications', body: { desktop: false } }]));
  expect(snapshot.notifications.desktop).toBe(false);
});

const quiet = (id: string, hidden: '' | 'parked' | 'paused') => ({
  id,
  name: id.toUpperCase(),
  connectors: [],
  links: [],
  key_pattern: '',
  theme: null,
  hidden,
});

test('parked and paused workspaces are listed with their mode, and Restore saves the config without their hidden key', async () => {
  snapshot.workspaces = [quiet('a', ''), quiet('b', 'parked'), quiet('c', 'paused')];
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { body?: string }) => {
      if (init?.body) {
        sent.push({ url, body: JSON.parse(init.body) });
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }
      return url === '/api/config'
        ? Promise.resolve({
            json: () =>
              Promise.resolve({
                ...reply,
                workspaces: [{ id: 'a' }, { id: 'b', hidden: 'parked' }, { id: 'c', hidden: 'paused' }],
              }),
          })
        : new Promise(() => undefined);
    }),
  );
  await openFromRail();

  expect(screen.getByText('parked')).toBeTruthy();
  expect(screen.getByText('paused')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Restore A' })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Restore B' }));

  await waitFor(() =>
    expect(sent).toEqual([
      {
        url: '/api/config',
        body: { workspaces: [{ id: 'a' }, { id: 'b' }, { id: 'c', hidden: 'paused' }], secrets: [] },
      },
    ]),
  );
  snapshot.workspaces = [];
});
