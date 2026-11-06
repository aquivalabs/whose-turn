import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bucket, buildDiagnostics, channelOf, failureCode, fitForRelay, openFailureLog, sourceType } from '../lib/diagnostics.mjs';
import { RateLimited } from '../lib/http-client.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { DEFAULT_LIMITS } from '../lib/health.mjs';
import './fixtures/demo-connector.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const MINUTE = 60000;
const NOW = Date.parse('2026-11-06T12:00:00Z');
const KEY = /^[a-z][a-z0-9_.]{0,39}$/;
const TEXT = /^[A-Za-z0-9_.:+-]{0,64}$/;

const fact = (extra = {}) => ({
  hidden: '', stale: false, lastAttemptAt: NOW - 2 * MINUTE, lastSuccessAt: NOW - 5 * MINUTE, failures: [], customRules: false, workflowRunsOff: 0,
  rows: { your_move: 3, waiting: 7, done: 0, failing_checks: 1, review_requested: 2, mentions: 25 }, ...extra,
});

const relayAccepts = (diagnostics) => {
  assert.ok(Object.keys(diagnostics).length <= 60);
  for (const [key, value] of Object.entries(diagnostics)) {
    assert.match(key, KEY);
    const values = Array.isArray(value) ? value : [value];
    assert.ok(values.length <= 10, key);
    for (const item of values) {
      assert.ok(typeof item === 'boolean' || Number.isFinite(item) || (typeof item === 'string' && TEXT.test(item)), `${key}: ${item}`);
    }
  }
};

test('a failed poll is named by a closed code from its class and upstream status, never from its text', () => {
  const status = (code) => Object.assign(new Error('secret-host.example said no'), { upstreamStatus: code });
  assert.equal(failureCode(new RateLimited('429')), 'RATE_LIMITED');
  assert.deepEqual([401, 403, 404, 500, 503, 418].map((code) => failureCode(status(code))), ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'UPSTREAM_5XX', 'UPSTREAM_5XX', 'UNKNOWN']);
  assert.equal(failureCode(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'TIMEOUT');
  assert.equal(failureCode(new SyntaxError('Unexpected token')), 'PARSE_FAILED');
  assert.equal(failureCode(new Error('UNAUTHENTICATED')), 'UNKNOWN');
  assert.equal(failureCode(undefined), 'UNKNOWN');
});

test('a source type is a built-in connector or other, and a count goes as its bucket', () => {
  assert.equal(sourceType('github'), 'github');
  assert.equal(sourceType('acme-internal'), 'other');
  assert.equal(sourceType('constructor'), 'other');
  assert.deepEqual([0, 1, 5, 6, 20, 21, 900].map(bucket), ['0', '1-5', '1-5', '6-20', '6-20', '21+', '21+']);
});

test('the channel is the window, a known Claude client, another MCP client, or the API, and never the raw client name', () => {
  assert.equal(channelOf({ client: { theme: 'dark' }, from: 'mcp:claude-code' }), 'window');
  assert.equal(channelOf({ from: 'mcp:claude-code' }), 'mcp:claude-code');
  assert.equal(channelOf({ from: 'mcp:claude-ai' }), 'mcp:claude-desktop');
  assert.equal(channelOf({ from: 'mcp:acme-bot' }), 'mcp:other');
  assert.equal(channelOf({ from: 'caller' }), 'api');
  assert.equal(channelOf({}), 'api');
});

test('the failure log keeps the last ten failures across a restart and drops entries it does not recognise', () => {
  const dir = scratchDir('wt-diag-');
  let clock = NOW;
  const log = openFailureLog(dir, () => clock);
  for (let index = 0; index < 12; index += 1) {
    clock += MINUTE;
    log.record(index % 2 ? 'github' : 'acme', index === 11 ? 'made-up' : 'UNAUTHENTICATED');
  }
  assert.equal(log.recent().length, 10);
  assert.deepEqual(log.recent().at(-1), { type: 'github', code: 'UNKNOWN', at: NOW + 12 * MINUTE });
  assert.equal(log.recent()[0].type, 'other');
  log.flush();
  const file = join(dir, 'failures.json');
  writeFileSync(file, JSON.stringify([...JSON.parse(readFileSync(file, 'utf8')), { type: 'jira', code: 'jira.example said 401', at: 1 }, null]));
  assert.equal(openFailureLog(dir).recent().length, 10);
});

test('a window report carries the monitor, update, settings, health, rows and the window snapshot, all in the relay limits', () => {
  const diagnostics = buildDiagnostics({
    version: '1.0.0-beta.1', channel: 'window', now: NOW,
    update: () => ({ current: '1.0.0-beta.1', latest: '1.0.0-beta.2', available: true, state: 'failed', reason: 'npm ERR! /Users/pat/secret' }),
    settings: { poll_seconds: 60, history_days: 14, stale_minutes: 15, failing_polls: 3, extra: 'x' },
    workspaces: () => [fact({ failures: [{ id: 'my-work-jira', type: 'jira', code: 'UNAUTHENTICATED' }], customRules: true, workflowRunsOff: 1 }), fact({ hidden: 'parked', lastAttemptAt: 0 })],
    failureLog: { recent: () => [{ type: 'jira', code: 'UNAUTHENTICATED', at: NOW - 3 * 3600000 }] },
    window: { panel: 'dashboard', font_px: 16.2, console_errors: 2, stream_reconnects: 1, stream_last_event_minutes: 0, api_failures: [502, 'x', 99, 404], scroll: { your_move: 47, waiting: 100, feed: 140 } },
  });
  relayAccepts(diagnostics);
  assert.deepEqual(diagnostics, {
    channel: 'window', 'monitor.version': '1.0.0-beta.1',
    'update.state': 'failed', 'update.available': true, 'update.latest': '1.0.0-beta.2',
    'settings.poll_seconds': 60, 'settings.history_days': 14, 'settings.stale_minutes': 15, 'settings.failing_polls': 3,
    'workspaces.total': '1-5', 'workspaces.parked': '1-5', 'workspaces.paused': '0', 'workspaces.stale': '0', 'workspaces.never_polled': '0',
    'poll.last_attempt_minutes': 2, 'poll.last_success_minutes': 5, 'failures.now': ['jira:UNAUTHENTICATED'],
    'rules.custom': '1-5', 'settings.workflow_runs_off': '1-5',
    'rows.your_move': '1-5', 'rows.waiting': '6-20', 'rows.done': '0', 'rows.failing_checks': '1-5', 'rows.review_requested': '1-5', 'rows.mentions': '21+',
    'failures.recent': ['jira:UNAUTHENTICATED'], 'failures.recent_age': ['1-6h'],
    'window.panel': 'dashboard', 'window.font_px': 16, 'window.console_errors': 2, 'window.stream_reconnects': 1, 'window.stream_last_event_minutes': 0,
    'window.api_failures': ['502', '404'], 'window.scroll.your_move': 50, 'window.scroll.waiting': 100,
  });
  assert.doesNotMatch(JSON.stringify(diagnostics), /secret|my-work|npm/);
});

test('before the first poll the times say none, and an agent report carries the plugin version and its own tool names only', () => {
  const diagnostics = buildDiagnostics({
    version: '1.0.0', channel: 'mcp:claude-code', now: NOW, pluginSeen: '1.0.13',
    workspaces: () => [fact({ lastAttemptAt: 0, lastSuccessAt: 0 })],
    window: { panel: 'dashboard' },
    agent: { tools: ['whose_turn_state', 'Bash', 'whose_turn_inbox', 'whose_turn_state', 'whose_turn_todos', 'whose_turn_refresh', 'whose_turn_feedback'], errors: 2 },
  });
  relayAccepts(diagnostics);
  assert.equal(diagnostics['poll.last_attempt_minutes'], 'none');
  assert.equal(diagnostics['workspaces.never_polled'], '1-5');
  assert.equal(diagnostics['plugin.version_seen'], '1.0.13');
  assert.deepEqual(diagnostics['agent.tools'], ['whose_turn_inbox', 'whose_turn_state', 'whose_turn_todos', 'whose_turn_refresh', 'whose_turn_feedback']);
  assert.equal(diagnostics['agent.errors'], 2);
  assert.equal('window.panel' in diagnostics, false);
  const old = buildDiagnostics({ version: 'dev build', channel: 'mcp:other', pluginSeen: 'latest' });
  assert.equal(old['plugin.version_seen'], 'old_no_header');
  assert.equal(buildDiagnostics({ version: '1.0.0', channel: 'mcp:other', pluginSeen: 'x'.repeat(64) })['plugin.version_seen'], 'old_no_header');
  assert.equal(old['monitor.version'], 'unknown');
  assert.deepEqual(old['agent.tools'], []);
});

test('a block that throws becomes diag.error and the rest of the report still goes', () => {
  const diagnostics = buildDiagnostics({
    version: '1.0.0', channel: 'api',
    workspaces: () => { throw new Error('/Users/pat/work broke'); },
    update: () => { throw new Error('no'); },
  });
  relayAccepts(diagnostics);
  assert.deepEqual(diagnostics['diag.error'], ['update', 'workspaces']);
  assert.equal(diagnostics.channel, 'api');
});

test('fitting for the relay drops bad keys and values, cuts lists to ten and keys to sixty', () => {
  const many = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`k${index}`, index]));
  assert.equal(Object.keys(fitForRelay(many)).length, 60);
  assert.deepEqual(fitForRelay({ Bad: 1, 'ok.key': 'has space', list: ['a', 'b c', ...'cdefghijklmn'], inf: Infinity, flag: false, obj: {} }), { list: ['a', ...'cdefghijk'], flag: false });
});

test('a workspace reports its facts: attempt and success times, current failure codes, and row counts', async () => {
  const recorded = [];
  CONNECTORS.diagflaky = { id: 'diagflaky', poll: async () => { throw Object.assign(new Error('pat@acme said no'), { upstreamStatus: 401 }); } };
  const built = createWorkspace(
    { id: 'n', name: 'Northwind', key_pattern: 'NW-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'demo', id: 'demo', scenario: 'northwind' }, { type: 'diagflaky', id: 'mine' }, { type: 'github', id: 'gh', workflow_runs: false, repos: [] }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, limits: () => DEFAULT_LIMITS, notify: () => {}, http: { fetchJson: async () => { throw Object.assign(new Error('x'), { upstreamStatus: 503 }); } }, secrets: { get: async () => 'token' }, onFailure: (type, code) => recorded.push(`${type}:${code}`) },
  );
  assert.equal(built.diagnosticFacts().lastAttemptAt, 0);
  await built.poll();
  await built.poll();
  const facts = built.diagnosticFacts();
  assert.ok(facts.lastAttemptAt > 0 && facts.lastSuccessAt > 0);
  assert.deepEqual(facts.failures.map((failure) => `${failure.type}:${failure.code}`), ['diagflaky:UNAUTHENTICATED', 'github:UPSTREAM_5XX']);
  assert.deepEqual(recorded, ['diagflaky:UNAUTHENTICATED', 'github:UPSTREAM_5XX']);
  assert.equal(facts.workflowRunsOff, 1);
  assert.equal(facts.customRules, false);
  assert.ok(facts.rows.your_move > 0);
  assert.deepEqual(Object.keys(facts.rows), ['your_move', 'waiting', 'done', 'failing_checks', 'review_requested', 'mentions']);
  delete CONNECTORS.diagflaky;
});
