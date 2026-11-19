import { test } from 'node:test';
import assert from 'node:assert/strict';
import github, { reviewDecision } from '../connectors/github.mjs';

const SINCE = '2026-10-01T00:00:00Z';

const fakeGh = ({ reviewItems = [], prItems = [], notes = [], replies = {} } = {}) => {
  const asked = [];
  const http = {
    fetchJson: async (url) => {
      const { pathname, searchParams } = new URL(url);
      asked.push(decodeURIComponent(`${pathname}?${searchParams}`).replace(/\+/g, ' '));
      if (pathname === '/search/issues') {
        return { items: (searchParams.get('q') || '').includes('user-review-requested:') ? reviewItems : prItems };
      }
      if (pathname in replies) {
        return replies[pathname];
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

test('an approver asked to review again no longer counts as approved, and neither does one who asked for changes (RMA-468)', () => {
  // Setup
  const review = (login, state) => ({ user: { login }, state });
  const reviews = [review('sam', 'APPROVED'), review('ann', 'COMMENTED')];
  const changes = [review('sam', 'CHANGES_REQUESTED'), review('ann', 'APPROVED')];
  // Exercise + Verify
  assert.equal(reviewDecision(reviews), 'APPROVED');
  assert.equal(reviewDecision(reviews, ['sam']), '');
  assert.equal(reviewDecision(changes, ['sam']), 'APPROVED');
});

test('a polled PR whose approver is requested again reads not approved (RMA-468)', async () => {
  // Setup
  const pull = { number: 5, title: 'PROJ-5 x', state: 'open', merged_at: null, base: { ref: 'main' }, head: { sha: 'abc' }, user: { login: 'pat' }, updated_at: '2026-11-05T10:00:00Z', html_url: 'https://github.com/acme/app/pull/5' };
  const approval = [{ user: { login: 'sam' }, state: 'APPROVED', submitted_at: '2026-11-05T09:00:00Z', html_url: 'https://github.com/acme/app/pull/5#r', body: '' }];
  const replies = (requested) => ({ '/repos/acme/app/pulls/5': { ...pull, requested_reviewers: requested }, '/repos/acme/app/pulls/5/reviews': approval });
  const item = { number: 5, updated_at: pull.updated_at };
  // Exercise
  const approved = await pollOnce(fakeGh({ prItems: [item], replies: replies([]) }).http);
  const asked = await pollOnce(fakeGh({ prItems: [item], replies: replies([{ login: 'sam' }]) }).http);
  // Verify
  assert.equal(approved.prs[0].review, 'APPROVED');
  assert.equal(asked.prs[0].review, '');
const mention = { id: 'n7', reason: 'mention', updated_at: '2026-11-05T10:00:00Z', repository: { full_name: 'acme/app' }, subject: { type: 'PullRequest', title: 'PROJ-7 x', url: 'https://api.github.com/repos/acme/app/pulls/7' } };
const asking = (login) => ({ user: { login }, created_at: '2026-11-05T09:00:00Z', html_url: 'https://github.com/acme/app/pull/7#c', body: '@pat can you check?' });

test('a mention on an open PR asks you, and the same mention stops asking once the PR is merged (RMA-433)', async () => {
  // Setup
  const comments = { '/repos/acme/app/issues/7/comments': [asking('sam')] };
  const open = fakeGh({ notes: [mention], replies: { ...comments, '/repos/acme/app/issues/7': { pull_request: { merged_at: null } } } });
  const merged = fakeGh({ notes: [mention], replies: { ...comments, '/repos/acme/app/issues/7': { pull_request: { merged_at: '2026-11-06T10:00:00Z' } } } });
  // Exercise
  const before = await pollOnce(open.http);
  const after = await pollOnce(merged.http);
  // Verify
  assert.deepEqual(before.asks.map((ask) => [ask.kind, ask.who]), [['mentioned you', 'sam']]);
  assert.deepEqual(after.asks, []);
});

test('your own comment that mentions you is not something waiting on you (RMA-433)', async () => {
  // Setup
  const { http } = fakeGh({ notes: [mention], replies: { '/repos/acme/app/issues/7/comments': [asking('pat')] } });
  // Exercise
  const result = await pollOnce(http);
  // Verify
  assert.deepEqual(result.asks, []);
});
