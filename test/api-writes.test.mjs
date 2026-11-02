import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../lib/api.mjs';

const appDir = new URL('..', import.meta.url).pathname;
const port = 18000 + Math.floor(Math.random() * 1000);
const registry = { workspaces: [], rawWorkspaces: [], problems: [], subscribe: () => () => {} };

const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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
