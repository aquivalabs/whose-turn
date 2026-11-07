import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSource } from './fixtures/fake-source.mjs';
import { DEFAULT_RULES, GLOBAL_SETTINGS, settingsViolations } from '../lib/config.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { CONNECTORS, secretsRequired } from '../connectors/index.mjs';
import { MAX_BODY_CHARS } from '../lib/feedback.mjs';
import { emptyRegistry, startTestApi } from './fixtures/api.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const HOUR = 3600 * 1000;
const script = { activity: [] };
CONNECTORS.guarded = fakeSource({
  id: 'guarded',
  label: 'Guarded',
  fields: [],
  poll: async () => ({ tickets: [], prs: [], comments: [], activity: structuredClone(script.activity), asks: [], runs: [], me: 'Alex Doe' }),
});
const event = (id, at) => ({ at: new Date(at).toISOString(), pr: `o/r#${id}`, key: '', title: `PR ${id}`, kind: 'comment', who: 'Sam', url: `https://example.com/pull/${id}`, text: 'comment', body: 'comment' });
const openWorkspace = async () => {
  const workspace = createWorkspace(
    { id: 'guard', name: 'Guard', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ id: 'guarded', type: 'guarded' }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, http: {}, notify: () => {} },
  );
  await workspace.poll();
  return workspace;
};

test('each monitor setting is refused outside its range and accepted at both edges', () => {
  for (const [key, spec] of Object.entries(GLOBAL_SETTINGS)) {
    assert.deepEqual(settingsViolations({ [key]: spec.min }), [], key);
    assert.deepEqual(settingsViolations({ [key]: spec.max }), [], key);
    assert.equal(settingsViolations({ [key]: spec.min - 1 })[0].field, `settings.${key}`);
    assert.equal(settingsViolations({ [key]: spec.max + 1 })[0].field, `settings.${key}`);
  }
  assert.deepEqual(Object.entries(GLOBAL_SETTINGS).map(([key, spec]) => [key, spec.min, spec.max]), [['poll_seconds', 15, 3600], ['history_days', 1, 365], ['stale_minutes', 1, 1440], ['failing_polls', 1, 100]]);
});

test('POST /api/config with an out-of-range setting is refused with the field named, and /api/config exposes the bounds', async () => {
  // Setup
  let saved = 0;
  const { server, get, post } = await startTestApi({ saveSettings: () => { saved += 1; }, registry: emptyRegistry({ settings: {}, notifications: { desktop: true } }) });
  try {
    // Exercise
    const response = await post('/api/config', { settings: { poll_seconds: 1_000_000 } });
    const fields = (await (await get('/api/config')).json()).settings_fields;
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.details[0].reason, 'INVALID_CONFIG');
    assert.equal(error.details[1].field_violations[0].field, 'settings.poll_seconds');
    assert.equal(saved, 0);
    assert.deepEqual([fields.poll_seconds.min, fields.poll_seconds.max], [15, 3600]);
  } finally {
    server.close();
  }
});

test('marks {all: true} marks every feed event up to the server clock and leaves a newer one unseen', async () => {
  // Setup
  const now = Date.now();
  script.activity = [event(1, now - 2 * HOUR), event(2, now - HOUR), event(3, now + HOUR)];
  const workspace = await openWorkspace();
  assert.equal(workspace.summary().new_events, 3);
  // Exercise
  const marks = workspace.updateMarks({ all: true }).marks;
  // Verify
  assert.equal(workspace.summary().new_events, 1);
  assert.equal(marks.seen.length, 2);
  assert.ok(marks.base >= now && marks.base < now + HOUR);
});

test('POST /api/marks takes all only as true', async () => {
  // Setup
  const bodies = [];
  const workspace = { id: 'w', updateMarks: (body) => { bodies.push(body); return {}; } };
  const { server, post } = await startTestApi({ registry: emptyRegistry({ workspaces: [workspace] }) });
  try {
    // Exercise
    const wrong = await post('/api/marks', { ws: 'w', all: 'yes' });
    const ok = await post('/api/marks', { ws: 'w', all: true });
    // Verify
    assert.equal(wrong.status, 400);
    assert.equal(ok.status, 200);
    assert.deepEqual(bodies, [{ ws: 'w', all: true }]);
  } finally {
    server.close();
  }
});

const jira = (overrides = {}) => ({ type: 'jira', id: 'jira', base: 'https://your-site.atlassian.net', email: 'you@example.com', ...overrides });
const linear = (overrides = {}) => ({ type: 'linear', id: 'linear', workspace: 'your-team', ...overrides });

test('already enforced: pointing a stored token at another host, account or store entry needs the token again, for every connector type with a stored token', () => {
  assert.deepEqual(secretsRequired([jira()], jira({ base: 'https://evil.example' })), ['token']);
  assert.deepEqual(secretsRequired([linear()], linear({ workspace: 'other-team' })), ['api_key']);
  assert.deepEqual(secretsRequired([linear()], linear({ token_service: 'other-entry' })), ['api_key']);
  assert.deepEqual(secretsRequired([jira(), linear()], linear()), []);
  assert.deepEqual(secretsRequired([{ type: 'github', id: 'github', repo: 'you/app' }], { type: 'github', id: 'github', repo: 'you/app', account: 'other' }), []);
});

test('POST /api/config refuses a connector moved to another host unless the same request carries the token', async () => {
  // Setup
  let saved = 0;
  const current = [{ id: 'w', name: 'W', connectors: [jira()] }];
  const stored = [];
  const { server, post } = await startTestApi({ registry: emptyRegistry({ rawWorkspaces: current }), saveConfig: async () => { saved += 1; }, secrets: { set: async (service, account, value) => { stored.push({ service, account, value }); } } });
  const moved = [{ id: 'w', name: 'W', connectors: [jira({ base: 'https://evil.example' })] }];
  try {
    // Exercise
    const refused = await post('/api/config', { workspaces: moved });
    const accepted = await post('/api/config', { workspaces: moved, secrets: [{ ws: 'w', connector: 'jira', key: 'token', value: 'fresh-token' }] });
    // Verify
    assert.equal(refused.status, 400);
    assert.match(JSON.stringify((await refused.json()).error), /must be entered again/);
    assert.equal(accepted.status, 200);
    assert.equal(saved, 1);
    assert.equal(stored.length, 1);
  } finally {
    server.close();
  }
});

const feedbackServer = async (secretValue) => {
  const sent = [];
  const registry = emptyRegistry({ rawWorkspaces: [{ id: 'w', name: 'W', connectors: [jira()] }], workspaces: [{ id: 'w', sourceTypes: ['jira'] }] });
  const http = { fetchJson: async (url, options) => { sent.push(options.body); return { identifier: 'RMA-1', url: 'https://example.com/r', title: 't' }; } };
  const api = await startTestApi({ registry, http, secrets: { get: async () => secretValue }, reports: { list: () => [], add: () => {}, relayUrl: 'https://relay.example/', states: async () => [] } });
  return { ...api, sent };
};

test('a report whose text holds a stored secret is refused without echoing it, and nothing is sent', async () => {
  // Setup
  const { server, post, sent } = await feedbackServer('s3cret-token-value');
  try {
    // Exercise
    const response = await post('/api/feedback', { ws: 'w', title: 'Broken', kind: 'bug', body: 'my token is s3cret-token-value, see' });
    // Verify
    const text = JSON.stringify(await response.json());
    assert.equal(response.status, 400);
    assert.match(text, /stored secret/);
    assert.ok(!text.includes('s3cret-token-value'));
    assert.equal(sent.length, 0);
  } finally {
    server.close();
  }
});

test('a report longer than the relay body limit is refused naming the field', async () => {
  // Setup
  const { server, post, sent } = await feedbackServer('');
  try {
    // Exercise
    const response = await post('/api/feedback', { ws: 'w', text: 'x'.repeat(MAX_BODY_CHARS + 1) });
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.details[1].field_violations[0].field, 'text');
    assert.equal(sent.length, 0);
  } finally {
    server.close();
  }
});

test('a to-do added by Claude carries by: "Claude" in the session summary, one added by hand "you"', async () => {
  // Setup
  const workspace = await openWorkspace();
  // Exercise
  workspace.addTodo({ text: 'look at the export', by: 'Claude' });
  workspace.addTodo({ text: 'call the vendor' });
  // Verify
  const todos = workspace.summary().todos;
  assert.deepEqual(todos.map((todo) => [todo.text, todo.by]).sort(), [['call the vendor', 'you'], ['look at the export', 'Claude']]);
});
