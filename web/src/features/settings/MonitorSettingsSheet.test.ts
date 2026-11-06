import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import App from '@/App.vue';


const reply = {
  settings: { poll_seconds: 60, history_days: 14, stale_minutes: 15, failing_polls: 3 },
  settings_fields: {
    poll_seconds: { label: 'Poll every (seconds)', hint: 'how often', min: 15, max: 3600 },
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

test('a number field carries the limits the server sends', async () => {
  stubServer();

  await openFromRail();

  const field = screen.getByDisplayValue('60');
  expect([field.getAttribute('type'), field.getAttribute('min'), field.getAttribute('max')]).toEqual(['number', '15', '3600']);
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
          field_violations: [{ field: 'settings.poll_seconds', description: 'poll_seconds must be a number from 15 to 3600.' }],
        },
      ],
    },
  });
  await openFromRail();

  await fireEvent.update(screen.getByDisplayValue('60'), '0');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('poll_seconds must be a number from 15 to 3600.')).toBeTruthy();
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

test('parked and paused workspaces are listed with their mode, and Restore asks the hide endpoint to show that one workspace', async () => {
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
      { url: '/api/workspaces/hidden', body: { id: 'b', hidden: null } },
    ]),
  );
  snapshot.workspaces = [];
});

test('Restart asks the server to restart at once (RMA-356)', async () => {
  stubServer({ lifecycle: 'restarting' });
  await openFromRail();

  await fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  await waitFor(() => expect(sent.map((call) => call.url)).toEqual(['/api/restart']));
});

test('Quit asks first and stops only on Quit (RMA-356)', async () => {
  stubServer({ lifecycle: 'quitting' });
  await openFromRail();

  await fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
  expect(await screen.findByText(/Quit Whose Turn\?/)).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Keep running' }));
  expect(sent).toEqual([]);
  await fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
  const bar = (await screen.findByText(/Quit Whose Turn\?/)).parentElement as HTMLElement;
  await fireEvent.click(within(bar).getByRole('button', { name: 'Quit' }));
  await waitFor(() => expect(sent.map((call) => call.url)).toEqual(['/api/quit']));
});

test('once the monitor is quit the window says it is stopped and how to start it again (RMA-356)', async () => {
  stubServer();
  render(App);
  ui.lifecycle = 'quitting';

  expect(await screen.findByText('Whose Turn is stopped')).toBeTruthy();
  expect(screen.getByText(/ask Claude to start the monitor/)).toBeTruthy();
  ui.lifecycle = '';
});
