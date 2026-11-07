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
