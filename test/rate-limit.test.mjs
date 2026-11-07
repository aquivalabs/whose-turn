import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimited } from '../lib/http-client.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { nextDelay } from '../lib/backoff.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';
import github from '../connectors/github.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const limited = () => {
  throw new RateLimited('429 from api.example');
};

test('a RateLimited carries its name', () => {
  assert.equal(new RateLimited('x').name, 'RateLimited');
});

test('a workspace whose source answers 429 reports rateLimited', async () => {
  // The token comes from the environment, so the test never shells out to gh (absent on CI).
  process.env.GH_TOKEN = 'stub';
  const built = createWorkspace(
    { id: 'w', name: 'Work', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'github', id: 'gh', repo: 'acme/app', me: 'pat' }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, http: { fetchJson: limited }, notify: () => {} },
  );
  const outcome = await built.poll();
  assert.equal(outcome.rateLimited, true);
});

test('the GitHub connector rethrows a rate limit instead of reporting a part error', async () => {
  const cache = { token: 'stub', tokenAt: Date.now() };
  await assert.rejects(github.poll({ settings: { repo: 'acme/app', me: 'pat' }, http: { fetchJson: limited }, cache, sinceIso: '2026-10-01T00:00:00Z', keyOf: () => null }), RateLimited);
});

test('the poll delay doubles while rate limited, caps at 15 minutes and resets afterwards', () => {
  assert.equal(nextDelay([{}, { rateLimited: true }], 60, 60), 120);
  assert.equal(nextDelay([{ rateLimited: true }], 600, 60), 900);
  assert.equal(nextDelay([{}, {}], 900, 60), 60);
});
