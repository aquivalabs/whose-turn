import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApi } from '../lib/api.mjs';
import { resolveMode, tabUrl } from '../web/src/lib/window-mode.ts';

const appDir = new URL('..', import.meta.url).pathname;
const port = 19000 + Math.floor(Math.random() * 1000);
const registry = { workspaces: [], rawWorkspaces: [], problems: [], subscribe: () => () => {} };
const url = (path) => `http://127.0.0.1:${port}${path}`;
const post = (path, body, headers = {}) => fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('the window size is stored per data dir, read back, and bad values are refused', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'wt-window-'));
  const opened = [];
  const server = await startApi({ port, appDir, registry, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: {}, dataDir, opener: (call) => opened.push(call) });
  try {
    assert.deepEqual(await (await fetch(url('/api/window'))).json(), {});
    assert.equal((await post('/api/window', { width: 1200, height: 800 })).status, 200);
    assert.deepEqual(await (await fetch(url('/api/window'))).json(), { width: 1200, height: 800 });
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'window.json'), 'utf8')), { width: 1200, height: 800 });
    for (const bad of [{ width: 'wide', height: 800 }, { width: 100, height: 800 }, { width: 1200 }]) {
      const response = await post('/api/window', bad);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.status, 'INVALID_ARGUMENT');
    }
    assert.equal((await post('/api/window', { width: 1000, height: 700 }, { Origin: 'http://evil.example' })).status, 403);
    assert.deepEqual(await (await fetch(url('/api/window'))).json(), { width: 1200, height: 800 });

    assert.equal((await post('/api/open', { mode: 'app' })).status, 200);
    assert.equal((await post('/api/open', { mode: 'browser' })).status, 200);
    assert.equal((await post('/api/open', { mode: 'tab' })).status, 400);
    assert.equal((await post('/api/open', { mode: 'app' }, { Origin: 'http://evil.example' })).status, 403);
    assert.deepEqual(opened, [{ mode: 'app', port }, { mode: 'browser', port }]);
  } finally {
    server.close();
  }
});

test('the mode comes from the address first, then the window session, and a tab is the default', () => {
  assert.equal(resolveMode('?mode=app', ''), 'app');
  assert.equal(resolveMode('?mode=tab', 'app'), 'tab');
  assert.equal(resolveMode('', 'app'), 'app');
  assert.equal(resolveMode('', ''), 'tab');
  assert.equal(resolveMode('?mode=other', ''), 'tab');
  assert.equal(tabUrl('work'), '/?mode=tab&ws=work');
  assert.equal(tabUrl(''), '/?mode=tab');
});

const stubDir = mkdtempSync(join(tmpdir(), 'wt-stubs-'));
const stub = (name, body) => {
  writeFileSync(join(stubDir, name), `#!/bin/bash\n${body}\n`);
  chmodSync(join(stubDir, name), 0o755);
};
const argLog = join(stubDir, 'args.log');
const logArgs = (name) => `echo "${name} $*" >> "${argLog}"`;

const run = ({ system, chrome = true, remembered = '', args = [], linuxBrowser = '' }) => {
  stub('uname', `echo ${system}`);
  stub('curl', remembered ? `echo '${remembered}'` : 'exit 7');
  stub('open', `if [ "$1" = -Ra ]; then ${chrome ? 'exit 0' : 'exit 1'}; fi\n${logArgs('open')}`);
  stub('xdg-open', logArgs('xdg-open'));
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    rmSync(join(stubDir, name), { force: true });
  }
  if (linuxBrowser) {
    stub(linuxBrowser, logArgs(linuxBrowser));
  }
  writeFileSync(argLog, '');
  execFileSync('/bin/bash', [join(appDir, 'open.sh'), ...args], { env: { PATH: stubDir, WHOSE_TURN_PORT: '8771' } });
  return readFileSync(argLog, 'utf8').trim();
};

test('open.sh opens the app window on macOS at the remembered size, a tab with --browser or without Chrome', () => {
  assert.equal(run({ system: 'Darwin' }), 'open -na Google Chrome --args --app=http://127.0.0.1:8771/?mode=app --window-size=1500,950');
  assert.equal(run({ system: 'Darwin', remembered: '{"width":1200,"height":800}' }), 'open -na Google Chrome --args --app=http://127.0.0.1:8771/?mode=app --window-size=1200,800');
  assert.equal(run({ system: 'Darwin', args: ['--browser'] }), 'open http://127.0.0.1:8771/');
  assert.equal(run({ system: 'Darwin', chrome: false }), 'open http://127.0.0.1:8771/');
});

test('open.sh on Linux uses the first Chrome or Edge on PATH, else xdg-open', async () => {
  assert.equal(run({ system: 'Linux', args: ['--browser'] }), 'xdg-open http://127.0.0.1:8771/');
  assert.equal(run({ system: 'Linux' }), 'xdg-open http://127.0.0.1:8771/');
  run({ system: 'Linux', linuxBrowser: 'chromium' });
  for (let tries = 0; tries < 40 && !readFileSync(argLog, 'utf8'); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(readFileSync(argLog, 'utf8').trim(), 'chromium --app=http://127.0.0.1:8771/?mode=app --window-size=1500,950');
});
