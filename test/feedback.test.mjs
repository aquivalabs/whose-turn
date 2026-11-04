import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFeedback, openReports } from '../lib/feedback.mjs';
import { emptyRegistry, startTestApi } from './fixtures/api.mjs';
import { RateLimited } from '../lib/http-client.mjs';

const RELAY = 'https://relay.invalid/';
process.env.WHOSE_TURN_FEEDBACK_URL = RELAY;

const stub = ({ issues = [] } = {}) => {
  const calls = [];
  const http = { fetchJson: async (url, options = {}) => {
    calls.push({ url, ...options });
    if (options.method === 'POST') {
      return { identifier: 'RMA-500', url: 'https://tracker.invalid/RMA-500' };
    }
    return { issues };
  } };
  return { http, calls };
};
const failing = (error) => ({ fetchJson: async () => { throw error; } });
const reportsDir = () => mkdtempSync(join(tmpdir(), 'wt-reports-'));
const relayIssue = (extra = {}) => ({ identifier: 'RMA-500', title: 'Chevron wraps on narrow feed', url: 'u', outcome: 'open', updatedAt: '2026-11-02T12:00:00.000Z', answers: [], ...extra });
const filed = (dir) => openReports(dir).add({ id: 'RMA-500', title: 'The chevron wraps', kind: 'bug', filed_at: '2026-11-02T10:00:00.000Z' });

test('a bug is posted to the relay with its kind, title, body, version and context, and the identifier comes back', async () => {
  const { http, calls } = stub();
  const issue = await createFeedback({ http, version: '1.0.0' }, { kind: 'bug', title: 'The chevron wraps', body: 'On a narrow feed the chevron drops a line.', context: '## PROJ-1 · a row', from: 'the window' });
  assert.equal(issue.identifier, 'RMA-500');
  assert.equal(calls[0].url, RELAY);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.product, 'whose-turn');
  assert.equal(calls[0].body.kind, 'bug');
  assert.equal(calls[0].body.title, 'The chevron wraps');
  assert.match(calls[0].body.body, /drops a line/);
  assert.equal(calls[0].body.version, '1.0.0');
  assert.equal(calls[0].body.context.from, 'the window');
  assert.match(calls[0].body.context.about, /PROJ-1/);
});

test('an over-long title is cut to the relay limit, and an empty title is refused before any call', async () => {
  const { http, calls } = stub();
  await createFeedback({ http }, { title: 'x'.repeat(300) });
  assert.equal(calls[0].body.title.length, 140);
  await assert.rejects(createFeedback({ http }, { title: '  ' }), { reason: 'INVALID_ARGUMENT', metadata: { detail: 'a title is required' }, violations: [{ field: 'title', description: 'A report needs a title.' }] });
  assert.equal(calls.length, 1);
});

test('a relay 400, a rate limit and a failure come back as their own reasons, the raw text only in debug', async () => {
  const refused = await createFeedback({ http: failing(Object.assign(new Error('HTTP 400 from relay.invalid'), { upstreamStatus: 400 })) }, { title: 'x' }).catch((error) => error);
  assert.equal(refused.reason, 'INVALID_ARGUMENT');
  assert.equal(refused.code, 400);
  assert.match(refused.debug, /relay\.invalid/);
  assert.doesNotMatch(JSON.stringify(refused.toEnvelope()), /relay\.invalid/);
  const limited = await createFeedback({ http: failing(new RateLimited('429 from relay.invalid')) }, { title: 'x' }).catch((error) => error);
  assert.equal(limited.reason, 'RATE_LIMITED');
  const down = await createFeedback({ http: failing(Object.assign(new Error('HTTP 503 from relay.invalid'), { upstreamStatus: 503 })) }, { title: 'x' }).catch((error) => error);
  assert.equal(down.reason, 'UPSTREAM_FAILED');
  assert.equal(down.metadata.upstream_status, 503);
});

test('a filed report is remembered on disk and survives a reopen', async () => {
  const dir = reportsDir();
  const { http } = stub();
  await createFeedback({ http, reports: openReports(dir) }, { kind: 'bug', title: 'The chevron wraps' });
  const [stored] = openReports(dir).list();
  assert.equal(stored.id, 'RMA-500');
  assert.equal(stored.kind, 'bug');
  assert.match(stored.filed_at, /^\d{4}-/);
});

test('the list carries the state and outcome the relay gives, or the entry as filed when the relay cannot be asked', async () => {
  const dir = reportsDir();
  filed(dir);
  const [report] = await openReports(dir).states(stub({ issues: [relayIssue({ outcome: 'done' })] }));
  assert.equal(report.state, 'Done');
  assert.equal(report.outcome, 'done');
  assert.equal(report.title, 'Chevron wraps on narrow feed');
  assert.equal(report.changed_at, '2026-11-02T12:00:00.000Z');
  const [plain] = await openReports(dir).states({ http: failing(new Error('offline')) });
  assert.equal(plain.outcome, undefined);
  assert.equal(plain.title, 'The chevron wraps');
});

test('the detail of one report carries the relay answers, and flags a closed report without one', async () => {
  const dir = reportsDir();
  filed(dir);
  const answered = await openReports(dir).detail(stub({ issues: [relayIssue({ outcome: 'done', answers: [{ author: 'Maintainer', body: 'Fixed in 1.2.', at: '2026-11-02T12:00:00.000Z' }] })] }), 'RMA-500');
  assert.deepEqual(answered.answers, [{ at: '2026-11-02T12:00:00.000Z', by: 'Maintainer', text: 'Fixed in 1.2.' }]);
  assert.equal(answered.unanswered, false);
  const silent = await openReports(dir).detail(stub({ issues: [relayIssue({ outcome: 'dropped' })] }), 'RMA-500');
  assert.equal(silent.outcome, 'dropped');
  assert.equal(silent.unanswered, true);
  assert.equal(await openReports(dir).detail(stub(), 'RMA-999'), null);
});

test('one relay read serves the list and every detail for a minute, and a new report clears it', async () => {
  const dir = reportsDir();
  filed(dir);
  const reopened = openReports(dir);
  const { http, calls } = stub({ issues: [relayIssue()] });
  await reopened.states({ http });
  await reopened.states({ http });
  await reopened.detail({ http }, 'RMA-500');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${RELAY}?product=whose-turn&ids=RMA-500`);
  reopened.add({ id: 'RMA-501', title: 'Second', kind: 'idea', filed_at: '2026-11-02T11:00:00.000Z' });
  await reopened.states({ http });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, `${RELAY}?product=whose-turn&ids=RMA-501%2CRMA-500`);
});

test('an empty remark without a title is INVALID_ARGUMENT with a field violation on text, and nothing is filed', async () => {
  const { http, calls } = stub();
  const { server, post } = await startTestApi({ registry: emptyRegistry(), http, reports: { list: () => [], add: () => {}, states: async () => [] } });
  try {
    const response = await post('/api/feedback', { text: '  ' });
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.details[0].reason, 'INVALID_ARGUMENT');
    assert.deepEqual(error.details[1].field_violations.map((violation) => violation.field), ['text']);
    assert.equal(calls.length, 0);
  } finally {
    server.close();
  }
});

const composer = { command: process.execPath, args: ['-e', `process.stdout.write(JSON.stringify({ title: 'T', kind: 'bug', body: 'B' }))`] };

test('a remark is composed and filed with no setup, and the server refuses the same remark twice in a row', async () => {
  const { http, calls } = stub();
  const { server, post: postTo } = await startTestApi({ registry: emptyRegistry({ feedback: { composer } }), http, reports: { list: () => [], add: () => {}, states: async () => [] } });
  const post = async (text) => {
    const response = await postTo('/api/feedback', { text });
    return { status: response.status, body: await response.json() };
  };
  try {
    const first = await post('the chevron wraps');
    const again = await post('  the chevron wraps ');
    const other = await post('the title is cut off');
    assert.equal(first.status, 200);
    assert.equal(first.body.issue.identifier, 'RMA-500');
    assert.equal(again.status, 400);
    assert.match(again.body.error.details[0].metadata.detail, /the same remark was just sent/);
    assert.equal(other.status, 200);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 2);
  } finally {
    server.close();
  }
});

test('the server maps a relay failure and a rate limit to their reasons, without the upstream text', async () => {
  const attempt = async (http) => {
    const { server, post } = await startTestApi({ registry: emptyRegistry({ feedback: { composer } }), http, reports: { list: () => [], add: () => {}, states: async () => [] } });
    try {
      const response = await post('/api/feedback', { text: 'remark ' + Math.random() });
      return { status: response.status, body: await response.json() };
    } finally {
      server.close();
    }
  };
  const down = await attempt(failing(Object.assign(new Error('HTTP 503 from relay.invalid'), { upstreamStatus: 503 })));
  const limited = await attempt(failing(new RateLimited('429 from relay.invalid')));
  assert.equal(down.status, 502);
  assert.equal(down.body.error.details[0].metadata.upstream_status, 503);
  assert.doesNotMatch(JSON.stringify(down.body), /relay\.invalid/);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.details[0].reason, 'RATE_LIMITED');
});

test('GET /api/feedback lists the reports with their states and /api/feedback?id= carries the answers', async () => {
  const dir = reportsDir();
  filed(dir);
  const { http } = stub({ issues: [relayIssue({ outcome: 'done', answers: [{ author: 'Maintainer', body: 'Fixed.', at: '2026-11-02T12:00:00.000Z' }] })] });
  const { server, get } = await startTestApi({ registry: emptyRegistry(), http, reports: openReports(dir) });
  try {
    const list = await (await get('/api/feedback')).json();
    assert.deepEqual(Object.keys(list), ['reports']);
    assert.equal(list.reports[0].state, 'Done');
    const one = await (await get('/api/feedback?id=RMA-500')).json();
    assert.equal(one.report.answers[0].text, 'Fixed.');
  } finally {
    server.close();
  }
});
