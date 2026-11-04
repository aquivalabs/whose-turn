import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { emptyRegistry, startTestApi } from './fixtures/api.mjs';

test('a workspace write without ws is refused instead of landing in the first workspace', async () => {
  // Setup
  const { server, post } = await startTestApi();
  try {
    for (const path of ['/api/marks', '/api/todos']) {
      // Exercise
      const response = await post(path, { seen: ['x'], action: 'add', text: 'y' });
      // Verify
      const body = await response.json();
      assert.equal(response.status, 400, path);
      assert.equal(body.error.status, 'INVALID_ARGUMENT', path);
    }
    // Exercise + Verify
    assert.equal((await post('/api/refresh', {})).status, 200);
  } finally {
    server.close();
  }
});

test('an inbox hand-off without ws is refused, naming ws', async () => {
  // Setup
  const { server, post } = await startTestApi();
  try {
    // Exercise
    const response = await post('/api/inbox', { kind: 'workspace' });
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.status, 'INVALID_ARGUMENT');
    assert.match(error.details[0].metadata.detail, /\bws\b/);
  } finally {
    server.close();
  }
});

test('a config with no workspace is refused and nothing is saved', async () => {
  // Setup
  let saved = 0;
  const { server, post } = await startTestApi({ saveConfig: async () => { saved += 1; } });
  try {
    // Exercise
    const response = await post('/api/config', { workspaces: [] });
    // Verify
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.status, 'INVALID_ARGUMENT');
    assert.equal(body.error.details[0].metadata.detail, 'keep at least one workspace');
    assert.equal(saved, 0);
  } finally {
    server.close();
  }
});

test('a marks write with a wrong shape is refused naming the field, a valid one lands', async () => {
  // Setup
  const marks = { seen: [], base: 0, handled: {} };
  const workspace = { id: 'w', updateMarks: (body) => Object.assign(marks, body) };
  const { server, post } = await startTestApi({ registry: emptyRegistry({ workspaces: [workspace] }) });
  try {
    const wrong = [
      [{ seen: 'abc' }, 'seen'],
      [{ seen: [1] }, 'seen'],
      [{ unseen: 'abc' }, 'unseen'],
      [{ base: 'x' }, 'base'],
      [{ base: 4102444800000 }, 'base'],
      [{ handled: { 'NW-1': 'soon' } }, 'handled.NW-1'],
      [{ handled: 'yes' }, 'handled'],
      [{ notes: 'Checked' }, 'notes'],
      [{ notes: { 'NW-1': 5 } }, 'notes.NW-1'],
      [{ notes: { 'NW-1': 'x'.repeat(201) } }, 'notes.NW-1'],
    ];
    for (const [body, field] of wrong) {
      // Exercise
      const response = await post('/api/marks', { ws: 'w', ...body });
      // Verify
      const error = (await response.json()).error;
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(error.status, 'INVALID_ARGUMENT');
      assert.ok(JSON.stringify(error).includes(field), JSON.stringify(error));
    }
    assert.deepEqual(marks, { seen: [], base: 0, handled: {} });
    // Exercise
    const ok = await post('/api/marks', { ws: 'w', seen: ['a'], base: Date.now(), handled: { 'NW-1': new Date().toISOString(), 'NW-2': null }, notes: { 'NW-1': 'Checked with the customer, nothing to change' } });
    // Verify
    assert.equal(ok.status, 200);
    assert.deepEqual(marks.seen, ['a']);
  } finally {
    server.close();
  }
});

test('an unexpected exception in a handler answers INTERNAL, an unknown path still NOT_FOUND', async () => {
  // Setup
  const workspace = { id: 'w', updateMarks: () => { throw new Error('disk full'); } };
  const { server, get, post } = await startTestApi({ registry: emptyRegistry({ workspaces: [workspace] }) });
  const logged = console.error;
  console.error = () => {};
  try {
    // Exercise
    const failed = await post('/api/marks', { ws: 'w', seen: ['a'] });
    const unknown = await get('/api/nowhere');
    // Verify
    const error = (await failed.json()).error;
    assert.equal(failed.status, 500);
    assert.equal(error.status, 'INTERNAL');
    assert.equal(error.details[0].reason, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(error), /disk full/);
    assert.equal(error.details.some((detail) => detail['@type'] === 'DebugInfo'), false);
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error.details[0].reason, 'NOT_FOUND');
  } finally {
    console.error = logged;
    server.close();
  }
});

test('the raw exception text of an INTERNAL answer reaches the client only under WHOSE_TURN_DEBUG=1', async () => {
  // Setup
  const workspace = { id: 'w', updateMarks: () => { throw new Error('disk full'); } };
  const { server, post } = await startTestApi({ registry: emptyRegistry({ workspaces: [workspace] }) });
  const logged = console.error;
  console.error = () => {};
  process.env.WHOSE_TURN_DEBUG = '1';
  try {
    // Exercise
    const error = (await (await post('/api/marks', { ws: 'w', seen: ['a'] })).json()).error;
    // Verify
    assert.equal(error.message, 'The local server failed on this request; the details are in its log.');
    assert.equal(error.details.find((detail) => detail['@type'] === 'DebugInfo').detail, 'disk full');
  } finally {
    delete process.env.WHOSE_TURN_DEBUG;
    console.error = logged;
    server.close();
  }
});

test('a request that needs a workspace answers NO_WORKSPACE when none is configured, while /api/state keeps its empty snapshot', async () => {
  // Setup
  const { server, get } = await startTestApi();
  try {
    // Exercise
    const handoff = await get('/api/handoff?kind=workspace');
    const state = await get('/api/state');
    // Verify
    assert.equal(handoff.status, 412);
    assert.equal((await handoff.json()).error.details[0].reason, 'NO_WORKSPACE');
    assert.equal(state.status, 200);
    assert.deepEqual(await state.json(), { workspaces: [], problems: [], update: { current: '', latest: '', available: false, state: 'idle' } });
  } finally {
    server.close();
  }
});

test('a method other than GET or POST answers 405 METHOD_NOT_ALLOWED with an Allow header', async () => {
  // Setup
  const { server, get } = await startTestApi();
  try {
    // Exercise
    const response = await get('/api/todos', { method: 'DELETE' });
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, POST');
    assert.equal(error.details[0].reason, 'METHOD_NOT_ALLOWED');
    assert.equal(error.details[0].metadata.method, 'DELETE');
  } finally {
    server.close();
  }
});

test('a to-do with empty text is INVALID_ARGUMENT with a field violation on text', async () => {
  // Setup
  let added = 0;
  const workspace = { id: 'w', addTodo: () => { added += 1; }, saveTodos: () => {}, store: { todos: [] } };
  const { server, post } = await startTestApi({ registry: emptyRegistry({ workspaces: [workspace] }) });
  try {
    // Exercise
    const response = await post('/api/todos', { ws: 'w', action: 'add', text: '   ' });
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.details[0].reason, 'INVALID_ARGUMENT');
    assert.deepEqual(error.details[1].field_violations.map((violation) => violation.field), ['text']);
    assert.equal(added, 0);
  } finally {
    server.close();
  }
});

test('a port in use rejects startApi with one line naming the port and WHOSE_TURN_PORT', async () => {
  // Setup
  const holder = createServer();
  holder.listen(0, '127.0.0.1');
  await once(holder, 'listening');
  const { port } = holder.address();
  try {
    // Exercise + Verify
    await assert.rejects(startTestApi({ port }), (error) => {
      assert.match(error.message, new RegExp(`^Port ${port} is already in use: .*WHOSE_TURN_PORT`));
      assert.doesNotMatch(error.message, /\n/);
      return true;
    });
  } finally {
    holder.close();
  }
});

test('a secret with a line break in the value, service or account is refused naming the field and never stored', async () => {
  // Setup
  const stored = [];
  const { server, post } = await startTestApi({ secrets: { set: async (...args) => stored.push(args) } });
  try {
    for (const field of ['service', 'account', 'value']) {
      // Exercise
      const response = await post('/api/secrets', { service: 'svc', account: 'me', value: 'v', [field]: 'a\nb' });
      // Verify
      const error = (await response.json()).error;
      assert.equal(response.status, 400, field);
      assert.equal(error.status, 'INVALID_ARGUMENT', field);
      assert.match(error.details[0].metadata.detail, new RegExp(`^${field} `), field);
    }
    assert.deepEqual(stored, []);
  } finally {
    server.close();
  }
});

test('POST /api/notifications saves the setting and reports it; a missing or non-boolean value is refused', async () => {
  // Setup
  const saved = [];
  const registry = emptyRegistry({ notifications: { desktop: true }, saveNotifications: async (value) => saved.push(value) });
  const { server, post, get } = await startTestApi({ registry });
  try {
    // Exercise
    const ok = await post('/api/notifications', { desktop: false });
    const refused = await post('/api/notifications', { desktop: 'off' });
    const missing = await post('/api/notifications', {});
    // Verify
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { notifications: { desktop: true } });
    assert.deepEqual(saved, [{ desktop: false }]);
    assert.equal(refused.status, 400);
    assert.equal(missing.status, 400);
    assert.deepEqual((await (await get('/api/config')).json()).notifications, { desktop: true });
  } finally {
    server.close();
  }
});

test('a settings write saves the global keys and answers them; a bad one is refused naming the field and saves nothing', async () => {
  // Setup
  const saved = [];
  const registry = emptyRegistry({ settings: { poll_seconds: 60 }, saveSettings: async (settings) => { saved.push(settings); } });
  const { server, post, get } = await startTestApi({ registry });
  try {
    // Exercise
    const good = await post('/api/config', { settings: { poll_seconds: 30, failing_polls: 4 } });
    const bad = await post('/api/config', { settings: { poll_seconds: -1, nope: 1 } });
    const config = await (await get('/api/config')).json();
    // Verify
    assert.equal(good.status, 200);
    assert.deepEqual(saved, [{ poll_seconds: 30, failing_polls: 4 }]);
    assert.equal(bad.status, 400);
    const fields = (await bad.json()).error.details.flatMap((detail) => (detail.fieldViolations || detail.field_violations || []).map((entry) => entry.field));
    assert.deepEqual(fields, ['settings.poll_seconds', 'settings.nope']);
    assert.deepEqual(config.settings, { poll_seconds: 60 });
    assert.deepEqual(Object.keys(config.settings_fields), ['poll_seconds', 'history_days', 'stale_minutes', 'failing_polls']);
  } finally {
    server.close();
  }
});
