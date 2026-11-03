import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SERVER_DOWN } from './lib/problems.ts';

vi.mock('./backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

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
    .mockResolvedValue(reply({ marks: { seen: [], base: 4, handled: {} }, turn, counts }));
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
