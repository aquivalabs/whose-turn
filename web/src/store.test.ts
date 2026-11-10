import { ref, watch } from 'vue';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SERVER_DOWN } from './lib/problems.ts';


const reply = (body: unknown) => ({ json: () => Promise.resolve(body) }) as Response;
const workspaceReply = (id: string) => ({ workspace: { id, name: id.toUpperCase() } });
const freshStore = async () => {
  vi.resetModules();
  return import('./store.ts');
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

test('importing the store opens no connection and sends no request', async () => {
  const fetchStub = vi.fn();
  vi.stubGlobal('fetch', fetchStub);
  vi.stubGlobal('EventSource', vi.fn());
  await freshStore();
  expect(fetchStub).not.toHaveBeenCalled();
  expect(EventSource).not.toHaveBeenCalled();
});

test('a marks write applies the reply turn and counts', async () => {
  const store = await freshStore();
  const turn = [{ row_id: 'r1', group: 'you' }];
  const counts = { mine: 1, others: 2, failing: 0, done: 3 };
  const fetchStub = vi
    .fn()
    .mockResolvedValue(reply({ marks: { seen: [], base: 4, handled: {}, info: {} }, turn, counts }));
  vi.stubGlobal('fetch', fetchStub);

  const problem = await store.setMarks({ base: 4 });

  expect(problem).toBe('');
  expect(store.snapshot.turn).toEqual(turn);
  expect(store.snapshot.counts).toEqual(counts);
  expect(store.snapshot.marks.base).toBe(4);
});

test('a refused marks write returns the problem line and changes nothing', async () => {
  const store = await freshStore();
  const before = { ...store.snapshot.counts };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(reply({ error: { message: 'no such row', details: [] } })),
  );

  const problem = await store.setMarks({ handled: { r1: null } });

  expect(problem).toBe('Not saved: no such row');
  expect(store.snapshot.counts).toEqual(before);
});

test('a failing source gets one banner line with its reason and streak', async () => {
  const store = await freshStore();
  store.snapshot.workspace.name = 'Home';
  store.snapshot.errors = { trello: 'Unknown source type "trello"', 'other.part': 'slow' };
  store.snapshot.health = {
    ok: false,
    stale: false,
    fresh_at: '',
    failing: [{ source: 'trello', polls: 9 }],
    alerts: [{ id: 'failing:trello', text: 'Source trello has failed 9 polls in a row' }],
  };

  expect(store.alerts.value).toEqual([
    'Source trello: Unknown source type "trello", failed 9 polls in a row',
    'Home: other.part: slow',
  ]);
});

test('switching workspace with the server down leaves the current one alone', async () => {
  const store = await freshStore();
  store.ui.ws = 'home';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));

  await store.switchWorkspace('away');

  expect(store.ui.ws).toBe('home');
  expect(store.notice.value).toContain(SERVER_DOWN);
});

test('a late reply for an older request is dropped', async () => {
  const store = await freshStore();
  const pending: Record<string, (value: Response) => void> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          pending[new URL(url, 'http://x').searchParams.get('ws') || ''] = resolve;
        }),
    ),
  );

  const first = store.load('first');
  const second = store.load('second');
  pending.second(reply(workspaceReply('second')));
  await second;
  pending.first(reply(workspaceReply('first')));
  await first;

  expect(store.ui.ws).toBe('second');
  expect(store.snapshot.workspace.id).toBe('second');
});

test('the reconnect counter advances each time the stream opens, so problem lines can clear', async () => {
  const status = ref('CLOSED');
  vi.doMock('@vueuse/core', async (original) => ({
    ...(await original<object>()),
    useEventSource: () => ({ status, error: ref(null), data: ref(null), open: vi.fn() }),
  }));
  const store = await freshStore();
  const seen: number[] = [];
  watch(() => store.ui.reconnects, (count) => seen.push(count), { flush: 'sync' });
  status.value = 'OPEN';
  status.value = 'CONNECTING';
  status.value = 'OPEN';
  expect(store.ui.live).toBe(true);
  expect(seen).toEqual([1, 2]);
  vi.doUnmock('@vueuse/core');
});

test('an update message from the stream replaces the update status and loads nothing', async () => {
  const data = ref<unknown>(null);
  const fetchStub = vi.fn();
  vi.stubGlobal('fetch', fetchStub);
  vi.doMock('@vueuse/core', async (original) => ({
    ...(await original<object>()),
    useEventSource: () => ({ status: ref('OPEN'), error: ref(null), data, open: vi.fn() }),
  }));
  const store = await freshStore();
  const update = { current: '1.0.0-alpha.3', latest: '1.0.0-alpha.3', available: false, state: 'idle' };
  data.value = { update };
  expect(store.snapshot.update).toEqual(update);
  expect(fetchStub).not.toHaveBeenCalled();
  vi.doUnmock('@vueuse/core');
});

test('a report news message from the stream sets the dot and loads nothing, and an open sheet keeps it calm', async () => {
  const data = ref<unknown>(null);
  const fetchStub = vi.fn();
  vi.stubGlobal('fetch', fetchStub);
  vi.doMock('@vueuse/core', async (original) => ({
    ...(await original<object>()),
    useEventSource: () => ({ status: ref('OPEN'), error: ref(null), data, open: vi.fn() }),
  }));
  const store = await freshStore();
  data.value = { report_news: true };
  expect(store.ui.reportNews).toBe(true);
  data.value = { report_news: false };
  expect(store.ui.reportNews).toBe(false);
  store.ui.feedback = true;
  data.value = { report_news: true };
  expect(store.ui.reportNews).toBe(false);
  expect(fetchStub).not.toHaveBeenCalled();
  vi.doUnmock('@vueuse/core');
});

test('start opens the event stream once the first load has answered', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(reply(workspaceReply('w')))));
  const opened = vi.fn();
  vi.stubGlobal(
    'EventSource',
    vi.fn(function (this: object) {
      opened();
      return Object.assign(this, { close: vi.fn(), addEventListener: vi.fn(), readyState: 0 });
    }),
  );
  const store = await freshStore();
  await store.start();
  store.connect();
  expect(opened).toHaveBeenCalledTimes(1);
});

test('a hidden tab closes its stream and opens it again, after a fresh load, when it is back in front (RMA-453)', async () => {
  const fetchStub = vi.fn(() => Promise.resolve(reply(workspaceReply('w'))));
  vi.stubGlobal('fetch', fetchStub);
  const sources: { close: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'EventSource',
    vi.fn(function (this: object) {
      const source = Object.assign(this, { close: vi.fn(), addEventListener: vi.fn(), readyState: 0 });
      sources.push(source);
      return source;
    }),
  );
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const store = await freshStore();
  await store.start();
  expect(sources).toHaveLength(1);

  hidden = true;
  store.followVisibility();
  expect(sources[0].close).toHaveBeenCalledOnce();

  const loadsBefore = fetchStub.mock.calls.length;
  hidden = false;
  store.followVisibility();
  await vi.waitFor(() => expect(sources).toHaveLength(2));
  expect(fetchStub.mock.calls.length).toBeGreaterThan(loadsBefore);
  Reflect.deleteProperty(document, 'hidden');
});

test('a refused state request for a remembered workspace is retried once without it, and not when none was asked for', async () => {
  const store = await freshStore();
  const gone = {
    error: { message: 'no', details: [{ '@type': 'ErrorInfo', reason: 'NO_SUCH_WORKSPACE', metadata: {} }] },
  };
  const fetchStub = vi.fn((url: string) =>
    Promise.resolve(reply(url.includes('ws=') ? gone : workspaceReply('home'))),
  );
  vi.stubGlobal('fetch', fetchStub);

  await store.load('old');
  expect(store.ui.ws).toBe('home');
  expect(fetchStub).toHaveBeenCalledTimes(2);

  fetchStub.mockClear();
  fetchStub.mockResolvedValue(reply(gone));
  await store.load('');
  expect(fetchStub).toHaveBeenCalledTimes(1);
});

test('restoring a workspace posts one hide request with null and reloads the state', async () => {
  const store = await freshStore();
  const fetchStub = vi.fn((url: string) =>
    Promise.resolve(reply(url.startsWith('/api/state') ? workspaceReply('home') : { workspaces: [] })),
  );
  vi.stubGlobal('fetch', fetchStub);

  await store.restoreWorkspace('parked-one');

  const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/workspaces/hidden');
  expect(JSON.parse(String(init.body))).toEqual({ id: 'parked-one', hidden: null });
  expect(fetchStub.mock.calls.some(([target]) => String(target).startsWith('/api/state'))).toBe(true);
});

test('a lifecycle message sets the state and the status; quitting closes the stream and the window (RMA-425), a disconnect keeps the text, and the next open clears it (RMA-356)', async () => {
  const data = ref<unknown>(null);
  const status = ref('OPEN');
  const error = ref<unknown>(null);
  const close = vi.fn();
  vi.stubGlobal('fetch', vi.fn());
  const closePage = vi.fn();
  vi.doMock('@vueuse/core', async (original) => ({
    ...(await original<object>()),
    useEventSource: () => ({ status, error, data, open: vi.fn(), close }),
  }));
  vi.doMock('./lib/page-reload.ts', async (original) => ({ ...(await original<object>()), closePage }));
  const store = await freshStore();
  data.value = { lifecycle: 'restarting' };
  expect([store.ui.lifecycle, store.ui.status]).toEqual(['restarting', 'Restarting the monitor…']);
  error.value = new Event('error');
  expect(store.ui.status).toBe('Restarting the monitor…');
  status.value = 'CONNECTING';
  status.value = 'OPEN';
  expect([store.ui.lifecycle, store.ui.status]).toEqual(['', '']);
  data.value = { lifecycle: 'quitting' };
  expect([store.ui.lifecycle, store.ui.status]).toEqual(['quitting', 'The monitor is stopped.']);
  expect(close).toHaveBeenCalledOnce();
  expect(closePage).toHaveBeenCalledOnce();
  vi.doUnmock('@vueuse/core');
  vi.doUnmock('./lib/page-reload.ts');
});
