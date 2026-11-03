import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFeedback, openReports } from '../lib/feedback.mjs';
import { emptyRegistry, startTestApi } from './fixtures/api.mjs';
import { RateLimited } from '../lib/http-client.mjs';

const settings = { workspace: 'your-space', team: 'PROJ', project: 'monitor' };
const secrets = { get: async (service, account) => (service === 'whose-turn-feedback' && account === 'your-space' ? 'lin_api_write' : '') };
const stub = () => {
  const calls = [];
  const http = { fetchJson: async (url, options) => {
    calls.push(options.body);
    if (options.body.query.includes('query Lookup')) {
      return { data: { viewer: { id: 'u1' }, teams: { nodes: [{ id: 't1', key: 'PROJ', labels: { nodes: [{ id: 'l-bug', name: 'Bug' }, { id: 'l-imp', name: 'Improvement' }] } }] }, projects: { nodes: [{ id: 'p1', name: 'monitor' }] } } };
    }
    return { data: { issueCreate: { success: true, issue: { id: 'i1', identifier: 'PROJ-500', url: 'https://linear.app/your-space/issue/PROJ-500', title: options.body.variables.input.title } } } };
  } };
  return { http, calls };
};

test('a bug goes to the configured team and project with the Bug label, the body and the context in the description', async () => {
  const { http, calls } = stub();
  const cache = {};
  const issue = await createFeedback({ settings, secrets, http, cache }, { kind: 'bug', title: 'The chevron wraps', body: 'On a narrow feed the chevron drops a line.', context: { ws: 'demo' }, from: 'the window' });
  assert.equal(issue.identifier, 'PROJ-500');
  const input = calls[1].variables.input;
  assert.equal(input.teamId, 't1');
  assert.equal(input.projectId, 'p1');
  assert.deepEqual(input.labelIds, ['l-bug']);
  assert.equal(input.assigneeId, 'u1', 'the issue is assigned to the key owner, so it shows on their dashboard');
  assert.match(input.description, /drops a line/);
  assert.match(input.description, /"ws": "demo"/);
  await createFeedback({ settings, secrets, http, cache }, { kind: 'bug', title: 'With text', context: '## PROJ-1 · a row\nStatus: Open' });
  assert.match(calls[2].variables.input.description, /## PROJ-1 · a row/);
  assert.doesNotMatch(calls[2].variables.input.description, /```json/);
  await createFeedback({ settings, secrets, http, cache }, { kind: 'improvement', title: 'Second' });
  assert.equal(calls.length, 4);
});

test('feedback.assign false leaves the filed issue unassigned for triage', async () => {
  const { http, calls } = stub();
  await createFeedback({ settings: { ...settings, assign: false }, secrets, http, cache: {} }, { kind: 'idea', title: 'A quieter alert', body: 'The alert bar could fade.' });
  assert.equal(calls[1].variables.input.assigneeId, undefined);
});

test('no title, no config or no key each refuse with their reason, and a missing config wins over a missing title', async () => {
  // Setup
  const { http } = stub();
  // Exercise + Verify
  await assert.rejects(createFeedback({ settings, secrets, http, cache: {} }, { title: '  ' }), { reason: 'INVALID_ARGUMENT', metadata: { detail: 'a title is required' }, violations: [{ field: 'title', description: 'A report needs a title.' }] });
  await assert.rejects(createFeedback({ settings: null, secrets, http, cache: {} }, { title: 'x' }), { reason: 'NOT_CONFIGURED', code: 412 });
  await assert.rejects(createFeedback({ settings: null, secrets, http, cache: {} }, { title: '' }), { reason: 'NOT_CONFIGURED' });
  await assert.rejects(createFeedback({ settings: { ...settings, workspace: 'elsewhere' }, secrets, http, cache: {} }, { title: 'x' }), { reason: 'NOT_CONFIGURED' });
});

const reportsDir = () => mkdtempSync(join(tmpdir(), 'wt-reports-'));
const live = (state, comments = []) => ({ fetchJson: async (url, options) => (options.body.query.includes('query Answers')
  ? { data: { issue: { comments: { nodes: comments } } } }
  : { data: { issues: { nodes: [{ identifier: 'PROJ-500', title: 'Chevron wraps on narrow feed', url: 'u', updatedAt: '2026-11-02T12:00:00.000Z', state }] } } }) });
const offline = { fetchJson: async () => { throw new Error('offline'); } };
const filed = (dir) => openReports(dir).add({ id: 'PROJ-500', number: 500, title: 'The chevron wraps', kind: 'bug', filed_at: '2026-11-02T10:00:00.000Z' });

test('a filed issue is remembered on disk and survives a reopen', async () => {
  const dir = reportsDir();
  const { http } = stub();
  await createFeedback({ settings, secrets, http, cache: {}, reports: openReports(dir) }, { kind: 'bug', title: 'The chevron wraps' });
  const [stored] = openReports(dir).list();
  assert.equal(stored.id, 'PROJ-500');
  assert.equal(stored.kind, 'bug');
  assert.match(stored.filed_at, /^\d{4}-/);
});

test('the list carries the state and outcome Linear gives, or the entry as filed when Linear cannot be asked', async () => {
  const dir = reportsDir();
  filed(dir);
  const [report] = await openReports(dir).states({ settings, secrets, http: live({ name: 'Done', type: 'completed' }) });
  assert.equal(report.state, 'Done');
  assert.equal(report.outcome, 'done');
  assert.equal(report.title, 'Chevron wraps on narrow feed');
  const [plain] = await openReports(dir).states({ settings, secrets, http: offline });
  assert.equal(plain.outcome, undefined);
  assert.equal(plain.title, 'The chevron wraps');
});

test('the detail of one report carries the comments as answers, and flags a closed issue without one', async () => {
  const dir = reportsDir();
  filed(dir);
  const answered = await openReports(dir).detail({ settings, secrets, http: live({ name: 'Done', type: 'completed' }, [{ body: 'Fixed in 1.2.', createdAt: '2026-11-02T12:00:00.000Z', user: { name: 'Maintainer' } }]) }, 'PROJ-500');
  assert.deepEqual(answered.answers, [{ at: '2026-11-02T12:00:00.000Z', by: 'Maintainer', text: 'Fixed in 1.2.' }]);
  assert.equal(answered.unanswered, false);
  const silent = await openReports(dir).detail({ settings, secrets, http: live({ name: 'Canceled', type: 'canceled' }) }, 'PROJ-500');
  assert.equal(silent.outcome, 'dropped');
  assert.equal(silent.unanswered, true);
  assert.equal(await openReports(dir).detail({ settings, secrets, http: offline }, 'PROJ-999'), null);
});

test('the server refuses a remark at once when feedback is not configured, without running the composer', async () => {
  // Setup
  const dir = reportsDir();
  const marker = join(dir, 'composer-ran');
  const composer = { command: process.execPath, args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`] };
  const { server, post } = await startTestApi({ registry: emptyRegistry({ feedback: { composer } }) });
  try {
    // Exercise
    const response = await post('/api/feedback', { text: 'the chevron wraps' });
    // Verify
    const body = await response.json();
    assert.equal(response.status, 412);
    assert.equal(body.error.status, 'FAILED_PRECONDITION');
    assert.equal(body.error.details[0].reason, 'NOT_CONFIGURED');
    assert.match(body.error.message, /not configured/);
    assert.equal(existsSync(marker), false);
  } finally {
    server.close();
  }
});

test('an empty remark without a title is INVALID_ARGUMENT with a field violation on text, and nothing is filed', async () => {
  // Setup
  const { http, calls } = stub();
  const { server, post } = await startTestApi({ registry: emptyRegistry({ feedback: settings }), secrets, http, reports: { list: () => [], add: () => {}, states: async () => [] } });
  try {
    // Exercise
    const response = await post('/api/feedback', { text: '  ' });
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.details[0].reason, 'INVALID_ARGUMENT');
    assert.deepEqual(error.details[1].field_violations.map((violation) => violation.field), ['text']);
    assert.equal(calls.length, 0);
  } finally {
    server.close();
  }
});

test('the server refuses the same remark twice in a row and accepts a different one', async () => {
  // Setup
  const { http } = stub();
  const composer = { command: process.execPath, args: ['-e', `process.stdout.write(JSON.stringify({ title: 'T', kind: 'bug', body: 'B' }))`] };
  const { server, post: postTo } = await startTestApi({ registry: emptyRegistry({ feedback: { ...settings, composer } }), secrets, http, reports: { list: () => [], add: () => {}, states: async () => [] } });
  const post = async (text) => {
    const response = await postTo('/api/feedback', { text });
    return { status: response.status, body: await response.json() };
  };
  try {
    // Exercise
    const first = await post('the chevron wraps');
    const again = await post('  the chevron wraps ');
    const other = await post('the title is cut off');
    // Verify
    assert.equal(first.status, 200);
    assert.equal(again.status, 400);
    assert.match(again.body.error.details[0].metadata.detail, /the same remark was just sent/);
    assert.equal(other.status, 200);
  } finally {
    server.close();
  }
});

test('a Linear failure, a rate limit and a missing key come back as their own reasons, without the upstream text', async () => {
  // Setup
  const composer = { command: process.execPath, args: ['-e', `process.stdout.write(JSON.stringify({ title: 'T', kind: 'bug', body: 'B' }))`] };
  const failing = (error) => ({ fetchJson: async () => { throw error; } });
  const attempt = async (http, feedback, secretStore = secrets) => {
    const { server, post } = await startTestApi({ registry: emptyRegistry({ feedback: { ...feedback, composer } }), secrets: secretStore, http, reports: { list: () => [], add: () => {}, states: async () => [] } });
    try {
      const response = await post('/api/feedback', { text: 'remark ' + Math.random() });
      return { status: response.status, body: await response.json() };
    } finally {
      server.close();
    }
  };
  // Exercise
  const down = await attempt(failing(Object.assign(new Error('HTTP 503 from api.linear.app'), { upstreamStatus: 503 })), settings);
  const limited = await attempt(failing(new RateLimited('429 from api.linear.app')), settings);
  const keyless = await attempt(failing(new Error('unused')), settings, { get: async () => '' });
  // Verify
  assert.equal(down.status, 502);
  assert.equal(down.body.error.details[0].reason, 'UPSTREAM_FAILED');
  assert.equal(down.body.error.details[0].metadata.upstream_status, 503);
  assert.doesNotMatch(JSON.stringify(down.body), /api\.linear\.app/);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.details[0].reason, 'RATE_LIMITED');
  assert.equal(keyless.status, 412);
  assert.equal(keyless.body.error.details[0].reason, 'NOT_CONFIGURED');
});
