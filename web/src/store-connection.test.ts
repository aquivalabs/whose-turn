import { ref } from 'vue';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const reply = (body: unknown) => ({ json: () => Promise.resolve(body) }) as Response;
const freshStore = async () => {
  vi.resetModules();
  return import('./store.ts');
};
const streamStub = () => {
  const data = ref<unknown>(null);
  vi.doMock('@vueuse/core', async (original) => ({
    ...(await original<object>()),
    useEventSource: () => ({ status: ref('OPEN'), error: ref(null), data, eventSource: ref({}), open: vi.fn(), close: vi.fn() }),
  }));
  vi.doMock('./lib/page-reload.ts', async (original) => ({ ...(await original<object>()), closePage: vi.fn() }));
  return data;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('@vueuse/core');
  vi.doUnmock('./lib/page-reload.ts');
});

test('a restart that does not come back within a minute says so (RMA-436)', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('x'))));
  const data = streamStub();
  const store = await freshStore();
  data.value = { lifecycle: 'restarting' };

  await vi.advanceTimersByTimeAsync(59000);
  expect(store.ui.lifecycle).toBe('restarting');
  await vi.advanceTimersByTimeAsync(2000);

  expect([store.ui.lifecycle, store.ui.status]).toEqual(['lost', 'The monitor did not come back.']);
});

test('a stopped monitor that answers again is announced (RMA-436)', async () => {
  vi.useFakeTimers();
  const fetchStub = vi.fn((): Promise<Response> => Promise.reject(new Error('x')));
  vi.stubGlobal('fetch', fetchStub);
  const data = streamStub();
  const store = await freshStore();
  data.value = { lifecycle: 'quitting' };
  await vi.advanceTimersByTimeAsync(5000);
  expect(store.ui.lifecycle).toBe('quitting');

  fetchStub.mockImplementation(() => Promise.resolve(reply({})));
  await vi.advanceTimersByTimeAsync(5000);

  expect([store.ui.lifecycle, store.ui.status]).toEqual(['back', 'The monitor answers again.']);
});

test('a first load that gets no answer says so and Retry asks again (RMA-436)', async () => {
  const fetchStub = vi.fn((): Promise<Response> => Promise.reject(new Error('x')));
  vi.stubGlobal('fetch', fetchStub);
  streamStub();
  const store = await freshStore();

  await store.start();
  expect([store.ui.lifecycle, store.ui.status]).toEqual(['unanswered', 'The monitor did not answer.']);

  fetchStub.mockImplementation(() =>
    Promise.resolve(reply({ workspace: { id: 'a', name: 'A', hidden: false }, workspaces: [] })),
  );
  await store.retry();

  expect(store.ui.lifecycle).toBe('');
  expect(store.snapshot.workspace.id).toBe('a');
});

test('a refresh the server refuses shows the reason and ends Checking now (RMA-436)', async () => {
  const store = await freshStore();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: { message: 'busy', details: [] } })));

  store.refresh();
  expect(store.ui.status).toBe('Checking now…');
  await vi.waitFor(() => expect(store.ui.status).toBe(''));

  expect(store.notice.value).toBe('Not saved: busy');
});
