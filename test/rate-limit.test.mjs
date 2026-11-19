import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimited } from '../lib/failure.mjs';
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

test('a rate limit in a GitHub part becomes the failure of that part, with its status, limit and reset, and the other parts keep their data (RMA-483)', async () => {
  // Setup
  const cache = { token: 'stub', tokenAt: Date.now() };
  const resetAt = Date.now() + 12 * 60000;
  const fetchJson = async (url) => {
    if (/search\/issues.*author(%3A|:)/.test(url)) {
      throw new RateLimited('403 from api.example', { status: 403, resource: 'search', resetAt });
    }
    return url.includes('/notifications') ? [] : { workflow_runs: [] };
  };

  // Exercise
  const result = await github.poll({ settings: { repo: 'acme/app', me: 'pat' }, http: { fetchJson }, cache, sinceIso: '2026-10-01T00:00:00Z', keyOf: () => null });

  // Verify
  assert.deepEqual(result.failures, { pulls: { code: 'RATE_LIMITED', error: 'RateLimited', status: 403, limit: 'search', reset_min: 12 } });
  assert.match(result.errors.pulls, /^rate limited: /);
  assert.equal(result.errors.notifications, undefined);
});

test('a workspace whose GitHub part is rate limited reports PARTIAL with that part, and still backs off (RMA-483)', async () => {
  // Setup
  process.env.GH_TOKEN = 'stub';
  const recorded = [];
  const fetchJson = async (url) => {
    if (/search\/issues.*author(%3A|:)/.test(url)) {
      throw new RateLimited('403 from api.example', { status: 403, resource: 'search' });
    }
    return url.includes('/notifications') ? [] : { workflow_runs: [] };
  };
  const built = createWorkspace(
    { id: 'w', name: 'Work', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'github', id: 'gh', repo: 'acme/app', me: 'pat' }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, http: { fetchJson }, notify: () => {}, onFailure: (...args) => recorded.push(args) },
  );

  // Exercise
  const outcome = await built.poll();

  // Verify
  assert.equal(outcome.rateLimited, true);
  assert.deepEqual(recorded, [['github', 'PARTIAL', { part: 'pulls', code: 'RATE_LIMITED', error: 'RateLimited', status: 403, limit: 'search' }]]);
});

test('the poll delay doubles while rate limited, caps at 15 minutes and resets afterwards', () => {
  assert.equal(nextDelay([{}, { rateLimited: true }], 60, 60), 120);
  assert.equal(nextDelay([{ rateLimited: true }], 600, 60), 900);
  assert.equal(nextDelay([{}, {}], 900, 60), 60);
});

test('RateLimited is still exported where contract 1 adapters import it from', async () => {
  const { RateLimited: fromClient } = await import('../lib/http-client.mjs');
  assert.equal(fromClient, RateLimited);
});
