import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../lib/api.mjs';

const appDir = new URL('..', import.meta.url).pathname;
const port = 18000 + Math.floor(Math.random() * 1000);
const registry = { workspaces: [], rawWorkspaces: [], problems: [], subscribe: () => () => {} };

const postTo = (at, path, body) => fetch(`http://127.0.0.1:${at}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = (path, body) => postTo(port, path, body);

test('a workspace write without ws is refused instead of landing in the first workspace', async () => {
  const server = await startApi({ port, appDir, registry, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  try {
    for (const path of ['/api/marks', '/api/todos']) {
      const response = await post(path, { seen: ['x'], action: 'add', text: 'y' });
      const body = await response.json();
      assert.equal(response.status, 400, path);
      assert.equal(body.error.status, 'INVALID_ARGUMENT', path);
    }
    const refresh = await post('/api/refresh', {});
    assert.equal(refresh.status, 200);
  } finally {
    server.close();
  }
});

test('an inbox hand-off without ws is refused, naming ws', async () => {
  const server = await startApi({ port: port + 20, appDir, registry, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  try {
    const response = await postTo(port + 20, '/api/inbox', { kind: 'workspace' });
    const error = (await response.json()).error;
    assert.equal(response.status, 400);
    assert.equal(error.status, 'INVALID_ARGUMENT');
    assert.match(error.details[0].metadata.detail, /\bws\b/);
  } finally {
    server.close();
  }
});

test('a config with no workspace is refused and nothing is saved', async () => {
  let saved = 0;
  const server = await startApi({ port: port + 1, appDir, registry, requestPoll: () => {}, saveConfig: async () => { saved += 1; }, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  try {
    const response = await fetch(`http://127.0.0.1:${port + 1}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaces: [] }) });
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
  const marks = { seen: [], base: 0, handled: {} };
  const workspace = { id: 'w', updateMarks: (body) => Object.assign(marks, body) };
  const server = await startApi({ port: port + 2, appDir, registry: { ...registry, workspaces: [workspace] }, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  try {
    const wrong = [
      [{ seen: 'abc' }, 'seen'],
      [{ seen: [1] }, 'seen'],
      [{ base: 'x' }, 'base'],
      [{ base: 4102444800000 }, 'base'],
      [{ handled: { 'NW-1': 'soon' } }, 'handled.NW-1'],
      [{ handled: 'yes' }, 'handled'],
    ];
    for (const [body, field] of wrong) {
      const response = await postTo(port + 2, '/api/marks', { ws: 'w', ...body });
      const error = (await response.json()).error;
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(error.status, 'INVALID_ARGUMENT');
      assert.ok(JSON.stringify(error).includes(field), JSON.stringify(error));
    }
    assert.deepEqual(marks, { seen: [], base: 0, handled: {} });
    const ok = await postTo(port + 2, '/api/marks', { ws: 'w', seen: ['a'], base: Date.now(), handled: { 'NW-1': new Date().toISOString(), 'NW-2': null } });
    assert.equal(ok.status, 200);
    assert.deepEqual(marks.seen, ['a']);
  } finally {
    server.close();
  }
});

test('an unexpected exception in a handler answers INTERNAL, an unknown path still NOT_FOUND', async () => {
  const workspace = { id: 'w', updateMarks: () => { throw new Error('disk full'); } };
  const server = await startApi({ port: port + 3, appDir, registry: { ...registry, workspaces: [workspace] }, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  const logged = console.error;
  console.error = () => {};
  try {
    const failed = await postTo(port + 3, '/api/marks', { ws: 'w', seen: ['a'] });
    const error = (await failed.json()).error;
    assert.equal(failed.status, 500);
    assert.equal(error.status, 'INTERNAL');
    assert.equal(error.details[0].reason, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(error), /disk full/);
    assert.equal(error.details.some((detail) => detail['@type'] === 'DebugInfo'), false);
    const unknown = await fetch(`http://127.0.0.1:${port + 3}/api/nowhere`);
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error.details[0].reason, 'NOT_FOUND');
  } finally {
    console.error = logged;
    server.close();
  }
});

test('the raw exception text of an INTERNAL answer reaches the client only under WHOSE_TURN_DEBUG=1', async () => {
  const workspace = { id: 'w', updateMarks: () => { throw new Error('disk full'); } };
  const server = await startApi({ port: port + 4, appDir, registry: { ...registry, workspaces: [workspace] }, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  const logged = console.error;
  console.error = () => {};
  process.env.WHOSE_TURN_DEBUG = '1';
  try {
    const error = (await (await postTo(port + 4, '/api/marks', { ws: 'w', seen: ['a'] })).json()).error;
    assert.equal(error.message, 'The local server failed on this request; the details are in its log.');
    assert.equal(error.details.find((detail) => detail['@type'] === 'DebugInfo').detail, 'disk full');
  } finally {
    delete process.env.WHOSE_TURN_DEBUG;
    console.error = logged;
    server.close();
  }
});

test('a request that needs a workspace answers NO_WORKSPACE when none is configured, while /api/state keeps its empty snapshot', async () => {
  const server = await startApi({ port: port + 5, appDir, registry, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} } });
  try {
    const handoff = await fetch(`http://127.0.0.1:${port + 5}/api/handoff?kind=workspace`);
    assert.equal(handoff.status, 412);
    assert.equal((await handoff.json()).error.details[0].reason, 'NO_WORKSPACE');
    const state = await fetch(`http://127.0.0.1:${port + 5}/api/state`);
    assert.equal(state.status, 200);
    assert.deepEqual(await state.json(), { workspaces: [], problems: [] });
  } finally {
    server.close();
  }
});
