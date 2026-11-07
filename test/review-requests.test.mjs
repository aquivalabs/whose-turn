import { test } from 'node:test';
import assert from 'node:assert/strict';
import github from '../connectors/github.mjs';

const SINCE = '2026-10-01T00:00:00Z';

const fakeGh = ({ reviewItems = [], notes = [] } = {}) => {
  const asked = [];
  const http = {
    fetchJson: async (url) => {
      const { pathname, searchParams } = new URL(url);
      asked.push(decodeURIComponent(`${pathname}?${searchParams}`).replace(/\+/g, ' '));
      if (pathname === '/search/issues') {
        return { items: (searchParams.get('q') || '').includes('user-review-requested:') ? reviewItems : [] };
      }
      if (pathname === '/notifications') {
        return notes;
      }
      if (pathname === '/repos/acme/app') {
        return { default_branch: 'main' };
      }
      if (pathname.endsWith('/actions/runs')) {
        return { workflow_runs: [] };
      }
      return [];
    },
  };
  return { http, asked };
};

const stubToken = () => ({ token: 'stub', tokenAt: Date.now() });

const pollOnce = (http) => github.poll({ settings: { repo: 'acme/app', me: 'pat', workflow_runs: false }, http, cache: stubToken(), sinceIso: SINCE, keyOf: (title) => (/PROJ-\d+/.exec(title) || [''])[0] });

const reviewItem = (number, repo = 'acme/app') => ({
  number, title: `PROJ-${number} add export`, html_url: `https://github.com/${repo}/pull/${number}`,
  repository_url: `https://api.github.com/repos/${repo}`, user: { login: 'sam' }, updated_at: '2026-11-05T10:00:00Z', body: 'Please look',
});

test('a review request comes from the search, read or unread, and names the PR, its author and its ticket (RMA-358)', async () => {
  // Setup
  const { http, asked } = fakeGh({ reviewItems: [reviewItem(4011), reviewItem(12, 'acme/api')] });
  // Exercise
  const result = await pollOnce(http);
  // Verify
  const reviews = result.asks.filter((ask) => ask.kind === 'review requested');
  assert.deepEqual(reviews.map((ask) => [ask.ref, ask.who, ask.key, ask.url]), [
    ['app#4011', 'sam', 'PROJ-4011', 'https://github.com/acme/app/pull/4011'],
    ['api#12', 'sam', 'PROJ-12', 'https://github.com/acme/api/pull/12'],
  ]);
  assert.ok(asked.some((path) => path.includes('user-review-requested:pat') && path.includes('org:acme') && path.includes('is:open')));
});

test('mentions are read from all participating notifications in the history window, not only unread ones', async () => {
  // Setup
  const { http, asked } = fakeGh();
  // Exercise
  await pollOnce(http);
  // Verify
  const notifications = asked.find((path) => path.startsWith('/notifications'));
  assert.match(notifications, /all=true/);
  assert.ok(notifications.includes(`since=${SINCE}`));
});

test('a review_requested notification no longer makes a row of its own, so a request is never listed twice', async () => {
  // Setup
  const note = { id: 'n1', reason: 'review_requested', updated_at: '2026-11-05T10:00:00Z', repository: { full_name: 'acme/app' }, subject: { type: 'PullRequest', title: 'PROJ-1 x', url: 'https://api.github.com/repos/acme/app/pulls/1' } };
  const { http } = fakeGh({ reviewItems: [reviewItem(1)], notes: [note] });
  // Exercise
  const result = await pollOnce(http);
  // Verify
  assert.equal(result.asks.filter((ask) => ask.kind === 'review requested').length, 1);
});

test('a source keeps only the review requests and mentions it owns, so one request shows once across the workspaces (RMA-378)', async () => {
  // Setup
  const { http } = fakeGh({ reviewItems: [reviewItem(4011), reviewItem(12, 'acme/api')] });
  const owns = (repo) => repo === 'acme/app';
  // Exercise
  const result = await github.poll({ settings: { repo: 'acme/app', me: 'pat', workflow_runs: false }, http, cache: stubToken(), sinceIso: SINCE, keyOf: () => '', owns });
  // Verify
  assert.deepEqual(result.asks.map((ask) => ask.ref), ['app#4011']);
});
