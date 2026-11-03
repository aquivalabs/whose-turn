import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedToken } from '../lib/token-cache.mjs';

test('a token is read once and kept, an empty one is read again, a stale one is refreshed', async () => {
  // Setup
  const answers = ['', 'tok-1', 'tok-2'];
  let reads = 0;
  const read = async () => answers[reads++];
  const cache = {};
  // Exercise
  const empty = await cachedToken(cache, read);
  const first = await cachedToken(cache, read);
  const kept = await cachedToken(cache, read);
  cache.tokenAt -= 11 * 60 * 1000;
  const refreshed = await cachedToken(cache, read);
  // Verify
  assert.deepEqual([empty, first, kept, refreshed], ['', 'tok-1', 'tok-1', 'tok-2']);
  assert.equal(reads, 3);
});
