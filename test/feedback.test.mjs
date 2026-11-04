import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clientOf, createFeedback, openReports } from '../lib/feedback.mjs';
import { emptyRegistry, startTestApi } from './fixtures/api.mjs';
import { RateLimited } from '../lib/http-client.mjs';

const RELAY = 'https://relay.invalid/';

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
const open = (dir, { http = stub().http } = {}) => openReports(dir, { http, relayUrl: RELAY });
const filed = (dir) => open(dir).add({ id: 'RMA-500', title: 'The chevron wraps', kind: 'bug', filed_at: '2026-11-02T10:00:00.000Z' });

test('a bug is posted to the relay with its kind, title, body, version and environment, and nothing else; the identifier comes back', async () => {
  const { http, calls } = stub();
  const issue = await createFeedback({ http, relayUrl: RELAY, version: '1.0.0', sources: ['linear', 'github', 'linear'] }, { kind: 'bug', title: 'The chevron wraps', body: 'On a narrow feed the chevron drops a line.' });
  assert.equal(issue.identifier, 'RMA-500');
  assert.equal(calls[0].url, RELAY);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.product, 'whose-turn');
  assert.equal(calls[0].body.kind, 'bug');
  assert.equal(calls[0].body.title, 'The chevron wraps');
  assert.match(calls[0].body.body, /drops a line/);
  assert.equal(calls[0].body.version, '1.0.0');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['body', 'environment', 'kind', 'product', 'title', 'version']);
  assert.deepEqual(Object.keys(calls[0].body.environment), ['os', 'osVersion', 'arch', 'node', 'install', 'sources']);
  assert.equal(calls[0].body.environment.node, process.version);
  assert.deepEqual(calls[0].body.environment.sources, ['github', 'linear']);
});

test('each client field is kept only when it is exactly the agreed shape, and a bad one is dropped without an error', () => {
  const good = { browser: { name: 'Edge', version: '130' }, display: { width: 1512, height: 982, scale: 2.00001, viewport: [1200, 800] }, locale: 'en-GB', timezone: 'Europe/Berlin', theme: 'dark', mode: 'app' };
  const clean = { ...good, display: { width: 1512, height: 982, scale: 2, viewport: [1200, 800] } };
  assert.deepEqual(clientOf(good), clean);
  const bad = {
    browser: [null, 'Chrome', { name: 'Chrome' }, { name: 'Netscape', version: '4' }, { name: 'Chrome', version: '130.0.1' }, { name: 'Chrome', version: '1234567' }, { name: 'Chrome', version: 130 }, { name: 'Chrome', version: '130', ua: 'Mozilla/5.0' }],
    display: [null, 'wide', { ...good.display, extra: 'x' }, { ...good.display, width: 0 }, { ...good.display, height: 20001 }, { ...good.display, width: 1.5 }, { ...good.display, scale: 9 }, { ...good.display, scale: 0.4 }, { ...good.display, scale: '2' }, { ...good.display, viewport: [1200] }, { ...good.display, viewport: [1200, -1] }, { width: 1, height: 1, scale: 1 }],
    locale: [5, '', 'en_GB', 'en-GB ', 'x'.repeat(36), 'https://host.invalid'],
    timezone: [5, '', 'Europe Berlin', 'Europe/Berlin\n', 'x'.repeat(65), 'http://host.invalid/a'],
    theme: ['blue', 1, null],
    mode: ['window', 1, null],
  };
  for (const [field, values] of Object.entries(bad)) {
    const { [field]: dropped, ...rest } = clean;
    for (const value of values) {
      assert.deepEqual(clientOf({ ...good, [field]: value }), rest, field + ' ' + JSON.stringify(value));
    }
  }
  assert.deepEqual(clientOf(undefined), {});
  assert.deepEqual(clientOf('x'), {});
  assert.deepEqual(clientOf({ ip: '1.2.3.4', userAgent: 'Mozilla/5.0' }), {});
});

test('the environment is built on the server, adds the clean client report, and has no user data', async () => {
  const { http, calls } = stub();
  await createFeedback({ http, relayUrl: RELAY, install: 'npm', sources: ['linear'], client: { theme: 'light', locale: 'x y', ip: '1.2.3.4' } }, { title: 'T' });
  const { environment } = calls[0].body;
  assert.deepEqual(Object.keys(environment), ['os', 'osVersion', 'arch', 'node', 'install', 'sources', 'theme']);
  assert.equal(environment.arch, process.arch);
  assert.equal(environment.install, 'npm');
  assert.equal(environment.theme, 'light');
});

test('an over-long title is cut to the relay limit, and an empty title is refused before any call', async () => {
  const { http, calls } = stub();
  await createFeedback({ http, relayUrl: RELAY }, { title: 'x'.repeat(300) });
  assert.equal(calls[0].body.title.length, 140);
  await assert.rejects(createFeedback({ http, relayUrl: RELAY }, { title: '  ' }), { reason: 'INVALID_ARGUMENT', metadata: { detail: 'a title is required' }, violations: [{ field: 'title', description: 'A report needs a title.' }] });
  assert.equal(calls.length, 1);
});

test('a relay 400, a rate limit and a failure come back as their own reasons, the raw text only in debug', async () => {
  const refused = await createFeedback({ relayUrl: RELAY, http: failing(Object.assign(new Error('HTTP 400 from relay.invalid'), { upstreamStatus: 400 })) }, { title: 'x' }).catch((error) => error);
  assert.equal(refused.reason, 'INVALID_ARGUMENT');
  assert.equal(refused.code, 400);
  assert.match(refused.debug, /relay\.invalid/);
  assert.doesNotMatch(JSON.stringify(refused.toEnvelope()), /relay\.invalid/);
  const limited = await createFeedback({ relayUrl: RELAY, http: failing(new RateLimited('429 from relay.invalid')) }, { title: 'x' }).catch((error) => error);
  assert.equal(limited.reason, 'RATE_LIMITED');
  const down = await createFeedback({ relayUrl: RELAY, http: failing(Object.assign(new Error('HTTP 503 from relay.invalid'), { upstreamStatus: 503 })) }, { title: 'x' }).catch((error) => error);
  assert.equal(down.reason, 'UPSTREAM_FAILED');
  assert.equal(down.metadata.upstream_status, 503);
});

test('a filed report is remembered on disk and survives a reopen', async () => {
  const dir = reportsDir();
  const { http } = stub();
  await createFeedback({ http, relayUrl: RELAY, reports: open(dir, { http }) }, { kind: 'bug', title: 'The chevron wraps' });
  const [stored] = open(dir).list();
  assert.equal(stored.id, 'RMA-500');
  assert.equal(stored.kind, 'bug');
  assert.match(stored.filed_at, /^\d{4}-/);
});

test('the list carries the state and outcome the relay gives, or the entry as filed when the relay cannot be asked', async () => {
  const dir = reportsDir();
  filed(dir);
  const [report] = await open(dir, stub({ issues: [relayIssue({ outcome: 'done' })] })).states();
  assert.equal(report.state, 'Done');
  assert.equal(report.outcome, 'done');
  assert.equal(report.title, 'Chevron wraps on narrow feed');
  assert.equal(report.changed_at, '2026-11-02T12:00:00.000Z');
  const [plain] = await open(dir, { http: failing(new Error('offline')) }).states();
  assert.equal(plain.outcome, undefined);
  assert.equal(plain.title, 'The chevron wraps');
});

test('the detail of one report carries the relay answers, and flags a closed report without one', async () => {
  const dir = reportsDir();
  filed(dir);
  const answered = await open(dir, stub({ issues: [relayIssue({ outcome: 'done', answers: [{ author: 'Maintainer', body: 'Fixed in 1.2.', at: '2026-11-02T12:00:00.000Z' }] })] })).detail('RMA-500');
  assert.deepEqual(answered.answers, [{ at: '2026-11-02T12:00:00.000Z', by: 'Maintainer', text: 'Fixed in 1.2.' }]);
  assert.equal(answered.unanswered, false);
  const silent = await open(dir, stub({ issues: [relayIssue({ outcome: 'dropped' })] })).detail('RMA-500');
  assert.equal(silent.outcome, 'dropped');
  assert.equal(silent.unanswered, true);
  assert.equal(await open(dir, stub()).detail('RMA-999'), null);
});

test('one relay read serves the list and every detail for a minute, and a new report clears it', async () => {
  const dir = reportsDir();
  filed(dir);
  const { http, calls } = stub({ issues: [relayIssue()] });
  const reopened = open(dir, { http });
  await reopened.states();
  await reopened.states();
  await reopened.detail('RMA-500');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${RELAY}?product=whose-turn&ids=RMA-500`);
  reopened.add({ id: 'RMA-501', title: 'Second', kind: 'idea', filed_at: '2026-11-02T11:00:00.000Z' });
  await reopened.states();
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

test('a request that still carries context is refused with INVALID_ARGUMENT and nothing is filed', async () => {
  const { http, calls } = stub();
  const { server, post } = await startTestApi({ registry: emptyRegistry(), http, reports: { list: () => [], add: () => {}, states: async () => [] } });
  try {
    const response = await post('/api/feedback', { kind: 'bug', title: 'T', context: '## PROJ-1' });
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.details[0].reason, 'INVALID_ARGUMENT');
    assert.match(error.details[0].metadata.detail, /context is no longer accepted/);
    assert.deepEqual(error.details[1].field_violations.map((violation) => violation.field), ['context']);
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
  const { server, get } = await startTestApi({ registry: emptyRegistry(), http, reports: open(dir, { http }) });
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

const workspace = (id, sourceTypes) => ({ id, sourceTypes });
const fileReport = async ({ registry, appDir, version = '1.2.3', ...body }) => {
  const { http, calls } = stub();
  const reports = { list: () => [], add: () => {}, states: async () => [], relayUrl: RELAY };
  const options = { registry: emptyRegistry(registry), http, reports, version };
  const api = await startTestApi(appDir ? { ...options, appDir } : options);
  try {
    const response = await api.post('/api/feedback', { kind: 'bug', title: 'T', ...body });
    assert.equal(response.status, 200);
    return calls.find((call) => call.method === 'POST').body;
  } finally {
    api.server.close();
  }
};
const two = { workspaces: [workspace('a', ['github', 'jira']), workspace('b', ['linear'])] };

test('the report names the sources of the workspace in ws only', async () => {
  const sent = await fileReport({ registry: two, ws: 'b' });
  assert.deepEqual(sent.environment.sources, ['linear']);
});

test('without ws the report names the sources of every workspace', async () => {
  const sent = await fileReport({ registry: two });
  assert.deepEqual(sent.environment.sources, ['github', 'jira', 'linear']);
});

test('install is npm when the app runs from node_modules, source otherwise', async () => {
  const installed = await fileReport({ registry: two, appDir: '/data/app/node_modules/whose-turn/' });
  assert.equal(installed.environment.install, 'npm');
  const checkout = await fileReport({ registry: two });
  assert.equal(checkout.environment.install, 'source');
});

test('the monitor version and the clean client report go to the relay', async () => {
  const sent = await fileReport({ registry: two, version: '9.8.7', client: { theme: 'dark', mode: 'tab', ip: '1.2.3.4' } });
  assert.equal(sent.version, '9.8.7');
  assert.equal(sent.environment.theme, 'dark');
  assert.equal(sent.environment.mode, 'tab');
  assert.equal(sent.environment.ip, undefined);
});

const adminStub = ({ issues = [], status = 0 } = {}) => {
  const calls = [];
  const http = { fetchJson: async (url, options = {}) => {
    calls.push({ url, ...options });
    if (url.includes('all=1')) {
      if (status) {
        throw Object.assign(new Error(`HTTP ${status}`), { upstreamStatus: status });
      }
      return { issues };
    }
    return { issues: issues.filter((issue) => issue.identifier === 'RMA-500') };
  } };
  return { http, calls };
};
const TOKEN = 'secret-admin-token-0123456789abcdef';
const everyIssues = [relayIssue({ identifier: 'RMA-502', title: 'Someone else' }), relayIssue(), relayIssue({ identifier: 'RMA-499', title: 'Older', outcome: 'done' })];

test('without an admin token the list is this machine\'s own reports and carries no mine marker', async () => {
  const { http, calls } = adminStub({ issues: everyIssues });
  const reports = openReports(reportsDir(), { http, relayUrl: RELAY, adminToken: async () => '' });
  reports.add({ id: 'RMA-500', title: 'The chevron wraps', filed_at: '2026-11-02T10:00:00.000Z' });
  const list = await reports.states();
  assert.deepEqual(list.map((report) => report.id), ['RMA-500']);
  assert.equal('mine' in list[0], false);
  assert.ok(calls.every((call) => !call.url.includes('all=1')));
});

test('with an admin token the relay lists every report newest first, each marked mine when this machine filed it, and any id has a page', async () => {
  const { http, calls } = adminStub({ issues: everyIssues });
  const reports = openReports(reportsDir(), { http, relayUrl: RELAY, adminToken: async () => TOKEN });
  reports.add({ id: 'RMA-500', title: 'The chevron wraps', filed_at: '2026-11-02T10:00:00.000Z' });
  const list = await reports.states();
  assert.deepEqual(list.map((report) => [report.id, report.mine]), [['RMA-502', false], ['RMA-500', true], ['RMA-499', false]]);
  assert.equal(list[0].title, 'Someone else');
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls.length, 1);
  const other = await reports.detail('RMA-502');
  assert.equal(other.title, 'Someone else');
  assert.equal(await reports.detail('RMA-404'), null);
});

test('a 401 from the relay falls back to this machine\'s own reports without a word', async () => {
  const { http } = adminStub({ issues: everyIssues, status: 401 });
  const reports = openReports(reportsDir(), { http, relayUrl: RELAY, adminToken: async () => 'wrong' });
  reports.add({ id: 'RMA-500', title: 'The chevron wraps', filed_at: '2026-11-02T10:00:00.000Z' });
  const list = await reports.states();
  assert.deepEqual(list.map((report) => report.id), ['RMA-500']);
  assert.equal('mine' in list[0], false);
  assert.equal(await reports.detail('RMA-502'), null);
});

test('the admin token never appears in an API response', async () => {
  const { http } = adminStub({ issues: everyIssues });
  const reports = openReports(reportsDir(), { http, relayUrl: RELAY, adminToken: async () => TOKEN });
  reports.add({ id: 'RMA-500', title: 'The chevron wraps', filed_at: '2026-11-02T10:00:00.000Z' });
  const { server, get } = await startTestApi({ registry: emptyRegistry(), reports, http });
  try {
    const list = await (await get('/api/feedback')).text();
    const one = await (await get('/api/feedback?id=RMA-502')).text();
    assert.match(list, /RMA-502/);
    assert.match(one, /Someone else/);
    assert.ok(!list.includes(TOKEN) && !one.includes(TOKEN));
  } finally {
    server.close();
  }
});
