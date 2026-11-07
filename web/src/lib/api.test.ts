import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getJson, post } from './api.ts';
import { recentApiFailures } from './window-report.ts';

const reply = (status: number) => ({ ok: status < 400, status, json: () => Promise.resolve({}) });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('records the status of a refused getJson call', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(503) as Response);
  const before = recentApiFailures().length;

  await getJson('/api/state');

  expect(recentApiFailures().length).toBe(before + 1);
  expect(recentApiFailures().at(-1)).toBe(503);
});

it('records the status of a refused post call', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(404) as Response);

  await post('/api/config', { a: 1 });

  expect(recentApiFailures().at(-1)).toBe(404);
});

it('records nothing for a 200', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(200) as Response);
  const before = [...recentApiFailures()];

  await getJson('/api/state');
  await post('/api/config');

  expect(recentApiFailures()).toEqual(before);
});
