import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient } from '../lib/http-client.mjs';

const realFetch = globalThis.fetch;
const answer = (status, text) => {
  globalThis.fetch = async () => new Response(text, { status });
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('a failed request carries its status but not the response body, unless keepBody asks for it (RMA-386)', async () => {
  // Setup
  answer(422, '{"error":"title too long"}');
  const { fetchJson } = createHttpClient();
  // Exercise
  const plain = await fetchJson('https://relay.example/reports', { method: 'POST', body: {} }).catch((error) => error);
  const kept = await fetchJson('https://relay.example/reports', { method: 'POST', body: {}, keepBody: true }).catch((error) => error);
  // Verify
  assert.equal(plain.upstreamStatus, 422);
  assert.equal('upstreamBody' in plain, false);
  assert.equal(kept.upstreamStatus, 422);
  assert.equal(kept.upstreamBody, '{"error":"title too long"}');
});

test('a kept body is cut to 2000 characters', async () => {
  // Setup
  answer(500, 'x'.repeat(5000));
  const { fetchJson } = createHttpClient();
  // Exercise
  const error = await fetchJson('https://relay.example/reports', { keepBody: true }).catch((failure) => failure);
  // Verify
  assert.equal(error.upstreamBody.length, 2000);
});

test('a rate limit carries its status, the limit GitHub names and when it resets; retry-after counts from now (RMA-483)', async () => {
  // Setup
  const resetSeconds = 1_900_000_000;
  globalThis.fetch = async () => new Response('API rate limit exceeded', { status: 403, headers: { 'x-ratelimit-resource': 'search', 'x-ratelimit-reset': String(resetSeconds) } });
  const { fetchJson } = createHttpClient();

  // Exercise
  const github = await fetchJson('https://api.github.example/search/issues').catch((error) => error);
  globalThis.fetch = async () => new Response('slow down', { status: 429, headers: { 'retry-after': '120' } });
  const before = Date.now();
  const retried = await fetchJson('https://api.example/x').catch((error) => error);

  // Verify
  assert.equal(github.name, 'RateLimited');
  assert.deepEqual([github.upstreamStatus, github.resource, github.resetAt], [403, 'search', resetSeconds * 1000]);
  assert.equal(retried.upstreamStatus, 429);
  assert.equal(retried.resource, undefined);
  assert.ok(retried.resetAt >= before + 120_000 && retried.resetAt <= Date.now() + 120_000);
});

test('a rate limit with no reset header has no reset time', async () => {
  globalThis.fetch = async () => new Response('', { status: 429 });
  const limited = await createHttpClient().fetchJson('https://api.example/x').catch((error) => error);
  assert.equal(limited.resetAt, undefined);
});
