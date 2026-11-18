import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { appDir, startTestApi } from './fixtures/api.mjs';
import { resolveMode, tabUrl } from '../web/src/lib/window-mode.ts';
import { scratchDir } from './fixtures/scratch.mjs';

test('the window size is stored per data dir, read back, and bad values are refused', async () => {
  // Setup
  const dataDir = scratchDir('wt-window-');
  const opened = [];
  const { server, port, url, post } = await startTestApi({ reports: {}, dataDir, opener: (call) => opened.push(call) });
  try {
    // Exercise + Verify
    assert.deepEqual(await (await fetch(url('/api/window'))).json(), { windows: 0 });
    assert.equal((await post('/api/window', { width: 1200, height: 800 })).status, 200);
    assert.deepEqual(await (await fetch(url('/api/window'))).json(), { width: 1200, height: 800, windows: 0 });
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'window.json'), 'utf8')), { width: 1200, height: 800 });
    for (const bad of [{ width: 'wide', height: 800 }, { width: 100, height: 800 }, { width: 1200 }]) {
      const response = await post('/api/window', bad);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.status, 'INVALID_ARGUMENT');
    }
    assert.equal((await post('/api/window', { width: 1000, height: 700 }, { Origin: 'http://evil.example' })).status, 403);
    assert.deepEqual(await (await fetch(url('/api/window'))).json(), { width: 1200, height: 800, windows: 0 });

    const controller = new AbortController();
    await fetch(url('/api/stream'), { signal: controller.signal });
    assert.equal((await (await fetch(url('/api/window'))).json()).windows, 1);
    controller.abort();

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

const freePort = await new Promise((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const stubDir = scratchDir('wt-stubs-');
const stub = (name, body) => {
  writeFileSync(join(stubDir, name), `#!/bin/bash\n${body}\n`);
  chmodSync(join(stubDir, name), 0o755);
};
const argLog = join(stubDir, 'args.log');
const logArgs = (name) => `echo "${name} $*" >> "${argLog}"`;

const replies = join(stubDir, 'replies');
const calls = join(stubDir, 'calls');

const run = ({ system, chrome = true, remembered = '', answers = [], args = [], linuxBrowser = '' }) => {
  const lines = answers.length ? answers : remembered ? [remembered] : [];
  writeFileSync(replies, lines.map((line) => `${line}\n`).join(''));
  writeFileSync(calls, '0');
  stub('uname', `echo ${system}`);
  stub('sleep', ':');
  stub('curl', `n=$(< "${calls}"); echo $((n + 1)) > "${calls}"\nlast=$(wc -l < "${replies}")\n[ "$last" -eq 0 ] && exit 7\nline=$((n + 1 > last ? last : n + 1))\nhead -n "$line" "${replies}" | tail -n 1`);
  for (const tool of ['wc', 'head', 'tail']) {
    stub(tool, `exec /usr/bin/${tool} "$@"`);
  }
  stub('open', `if [ "$1" = -Ra ]; then ${chrome ? 'exit 0' : 'exit 1'}; fi\n${logArgs('open')}`);
  stub('xdg-open', logArgs('xdg-open'));
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    rmSync(join(stubDir, name), { force: true });
  }
  if (linuxBrowser) {
    stub(linuxBrowser, logArgs(linuxBrowser));
  }
  writeFileSync(argLog, '');
  let status = 0;
  try {
    execFileSync('/bin/bash', [join(appDir, 'open.sh'), ...args], { env: { PATH: stubDir, WHOSE_TURN_PORT: String(freePort), WHOSE_TURN_OPEN_WAIT: '1' }, stdio: 'pipe' });
  } catch (error) {
    status = error.status;
  }
  const log = readFileSync(argLog, 'utf8').trim();
  return answers.length ? { log, status } : log;
};

test('open.sh opens the app window on macOS at the remembered size, a tab with --browser or without Chrome', () => {
  assert.equal(run({ system: 'Darwin' }), `open -na Google Chrome --args --app=http://127.0.0.1:${freePort}/?mode=app --window-size=1500,950`);
  assert.equal(run({ system: 'Darwin', remembered: '{"width":1200,"height":800}' }), `open -na Google Chrome --args --app=http://127.0.0.1:${freePort}/?mode=app --window-size=1200,800`);
  assert.equal(run({ system: 'Darwin', args: ['--browser'] }), `open http://127.0.0.1:${freePort}/`);
  assert.equal(run({ system: 'Darwin', chrome: false }), `open http://127.0.0.1:${freePort}/`);
});

test('open.sh waits for the app window to connect, and opens a tab and exits 1 when it never does', () => {
  // Setup
  const app = `open -na Google Chrome --args --app=http://127.0.0.1:${freePort}/?mode=app --window-size=1500,950`;
  // Exercise
  const connected = run({ system: 'Darwin', answers: ['{"windows":1}', '{"windows":1}', '{"windows":2}'] });
  const missing = run({ system: 'Darwin', answers: ['{"windows":1}'] });
  // Verify
  assert.deepEqual(connected, { log: app, status: 0 });
  assert.deepEqual(missing, { log: `${app}\nopen http://127.0.0.1:${freePort}/`, status: 1 });
});

test('open.sh on Linux uses the first Chrome or Edge on PATH, else xdg-open', async () => {
  assert.equal(run({ system: 'Linux', args: ['--browser'] }), `xdg-open http://127.0.0.1:${freePort}/`);
  assert.equal(run({ system: 'Linux' }), `xdg-open http://127.0.0.1:${freePort}/`);
  run({ system: 'Linux', linuxBrowser: 'chromium' });
  for (let tries = 0; tries < 200 && !readFileSync(argLog, 'utf8'); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(readFileSync(argLog, 'utf8').trim(), `chromium --app=http://127.0.0.1:${freePort}/?mode=app --window-size=1500,950`);
});

test('a second /api/open of the same mode within five seconds is refused and opens one window', async () => {
  // Setup
  const opened = [];
  const { server, port: at, post } = await startTestApi({ reports: {}, dataDir: scratchDir('wt-open-'), opener: (call) => opened.push(call) });
  const open = (mode) => post('/api/open', { mode });
  try {
    // Exercise
    const first = await open('app');
    const second = await open('app');
    const other = await open('browser');
    // Verify
    assert.equal(first.status, 200);
    const error = (await second.json()).error;
    assert.equal(second.status, 429);
    assert.equal(error.details[0].reason, 'OPEN_TOO_SOON');
    assert.ok(error.details[0].metadata.retry_after_seconds >= 1);
    assert.equal(other.status, 200);
    assert.deepEqual(opened, [{ mode: 'app', port: at }, { mode: 'browser', port: at }]);
  } finally {
    server.close();
  }
});

test('a window page opened under a foreign host name says where the window is, as HTML', async () => {
  // Setup
  const { server, port } = await startTestApi({ reports: {} });
  try {
    // Exercise
    const answer = await new Promise((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path: '/', headers: { host: 'wt.example:9' } }, (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], body }));
      });
      request.on('error', reject);
      request.end();
    });

    // Verify
    assert.equal(answer.status, 403);
    assert.match(answer.type, /^text\/html/);
    assert.ok(answer.body.includes(`http://127.0.0.1:${port}/`));
  } finally {
    server.close();
  }
});
