import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as github from '../connectors/github.mjs';
import { poll as demoPoll } from './fixtures/demo-connector.mjs';
import { connectorSummaries } from '../connectors/index.mjs';
import { compileRules, feedRows } from '../lib/rules.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';

test('two connectors of one type are told apart by their label or id; a lone one keeps the type label', () => {
  const summaries = connectorSummaries([
    { id: 'tracker', type: 'demo' },
    { id: 'code', type: 'demo', label: 'Demo code' },
    { id: 'github', type: 'github' },
  ]);
  assert.deepEqual(summaries.map((summary) => summary.label), ['tracker', 'Demo code', 'GitHub']);
});

const pr = { number: 7, title: 'Faster start-up', state: 'closed', merged_at: '2026-11-02T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', html_url: 'https://github.com/acme/app/pull/7', head: { sha: 's1' }, base: { ref: 'main' } };
const responses = {
  '/search/issues': { items: [{ number: 7, updated_at: pr.updated_at }] },
  '/repos/acme/app/pulls/7': pr,
  '/repos/acme/app/issues/7/comments': [{ user: { login: 'sam' }, created_at: '2026-11-02T09:00:00Z', html_url: 'https://github.com/acme/app/pull/7#c1', body: 'looks good' }],
  '/repos/acme/app/pulls/7/comments': [],
  '/repos/acme/app/pulls/7/reviews': [],
  '/repos/acme/app/commits/s1/check-runs': { check_runs: [] },
  '/notifications': [],
};
const http = { fetchJson: async (url) => responses[Object.keys(responses).find((path) => new URL(url).pathname === path)] };

test('a GitHub PR without a ticket reaches the feed as repo#number with its title', async () => {
  const cache = { token: 't', tokenAt: Date.now() };
  const result = await github.poll({ settings: { repo: 'acme/app', me: 'pat' }, http, cache, sinceIso: '2026-10-01T00:00:00Z', keyOf: () => '' });
  assert.deepEqual(result.activity.map((item) => [item.pr, item.title, item.kind]), [['app#7', 'Faster start-up', 'merged'], ['app#7', 'Faster start-up', 'comment']]);
});

test('the garden feed gives every PR item its repository and title, ticket or not', async () => {
  const result = await demoPoll({ settings: { scenario: 'garden' }, cache: {} });
  const stamped = Object.fromEntries(['activity', 'asks'].map((kind) => [kind, result[kind].map((item) => ({ ...item, source: 'demo' }))]));
  const feed = feedRows(stamped, { me: { demo: result.me }, rules: compileRules(DEFAULT_RULES) });
  const byRef = Object.fromEntries(feed.map((item) => [item.ref, item.title]));
  assert.equal(byRef['garden-bot#12'], 'Water schedule: skip rainy days');
  assert.equal(byRef['garden-bot#13'], 'Frost warning notifications');
  assert.ok(feed.every((item) => /^garden-bot#\d+$/.test(item.ref)));
});
