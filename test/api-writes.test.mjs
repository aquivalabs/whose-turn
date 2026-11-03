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
