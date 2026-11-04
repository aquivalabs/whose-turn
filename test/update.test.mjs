import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHANNEL, createUpdater, installedRoot, pinnedVersion, probeAgent, restartServer, runsInstalled } from '../lib/update.mjs';
import { startTestApi } from './fixtures/api.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'wt-update-'));

/** An updater on a scratch data dir whose registry answers `tags`, or fails when `tags` is an Error. */
const updaterWith = (tags, extra = {}) => {
  const notes = [];
  const asked = [];
  const http = { fetchJson: async (url) => { asked.push(url); if (tags instanceof Error) throw tags; return tags; } };
  const updater = createUpdater({ http, dataDir: scratch(), version: '1.0.0-alpha.2', installed: true, notify: (title, body) => notes.push([title, body]), registry: 'http://registry.test', restart: async () => {}, ...extra });
  return { updater, notes, asked };
};

test('a newer version under the channel tag is offered and announced once', async () => {
  // Setup
  const { updater, notes, asked } = updaterWith({ latest: '1.0.0-alpha.3', alpha: '1.0.0-alpha.3' });
  // Exercise
  const first = await updater.check();
  await updater.check();
  // Verify
  assert.equal(asked[0], 'http://registry.test/-/package/whose-turn/dist-tags');
  assert.deepEqual(first, { current: '1.0.0-alpha.2', latest: '1.0.0-alpha.3', available: true, state: 'idle' });
  assert.deepEqual(notes, [['Whose Turn 1.0.0-alpha.3 is out', 'Update from the window.']]);
});

test('the announcement is remembered across a restart of the server', async () => {
  // Setup
  const dataDir = scratch();
  const notes = [];
  const make = () => createUpdater({ http: { fetchJson: async () => ({ latest: '1.0.0-alpha.3' }) }, dataDir, version: '1.0.0-alpha.2', installed: true, notify: (title) => notes.push(title), restart: async () => {} });
  // Exercise
  await make().check();
  await make().check();
  // Verify
  assert.equal(notes.length, 1);
});

test('the same version offers nothing and notifies nothing', async () => {
  // Setup
  const { updater, notes } = updaterWith({ latest: '1.0.0-alpha.2', alpha: '1.0.0-alpha.2' });
  // Exercise
  const status = await updater.check();
  // Verify
  assert.equal(status.available, false);
  assert.equal(status.latest, '1.0.0-alpha.2');
  assert.deepEqual(notes, []);
});

test('an unreachable registry or a malformed tag leaves the offer as it was', async () => {
  for (const tags of [new Error('fetch failed'), { alpha: '1.0.0; rm -rf ~' }, null]) {
    // Setup
    const { updater, notes } = updaterWith(tags);
    // Exercise
    const status = await updater.check();
    // Verify
    assert.deepEqual(status, { current: '1.0.0-alpha.2', latest: '', available: false, state: 'idle' });
    assert.deepEqual(notes, []);
  }
});

test('a checkout never asks the registry and is never offered an update', async () => {
  // Setup
  const { updater, asked } = updaterWith({ latest: '1.0.0-alpha.3' }, { installed: false });
  // Exercise
  const status = await updater.check();
  // Verify
  assert.deepEqual(asked, []);
  assert.equal(status.available, false);
});

test('the server counts as installed only when its root is the plugin install, symlinks resolved', () => {
  // Setup
  const dataDir = scratch();
  mkdirSync(installedRoot(dataDir), { recursive: true });
  const link = join(scratch(), 'linked');
  symlinkSync(installedRoot(dataDir), link);
  // Exercise + Verify
  assert.equal(runsInstalled(installedRoot(dataDir), dataDir), true);
  assert.equal(runsInstalled(link, dataDir), true);
  assert.equal(runsInstalled(scratch(), dataDir), false);
  assert.equal(runsInstalled(installedRoot(scratch()), dataDir), false);
});

test('every install follows the latest dist-tag', () => {
  assert.equal(CHANNEL, 'latest');
});

/** A run that resolves when the test says so, with '' for success or npm's message. */
const deferredRun = () => {
  const calls = [];
  let finish;
  const run = (npm, args) => { calls.push([npm, ...args]); return new Promise((resolve) => { finish = resolve; }); };
  return { run, calls, finish: (outcome) => finish(outcome) };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('POST /api/update installs the channel version into the package location, refuses a second run, then restarts', async () => {
  // Setup
  const installer = deferredRun();
  let restarts = 0;
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: installer.run, npm: 'fake-npm', restart: async () => { restarts += 1; } });
  await updater.check();
  const { server, post, get } = await startTestApi({ updater });
  try {
    // Exercise
    const started = await post('/api/update', {});
    const again = await post('/api/update', {});
    // Verify
    assert.equal(started.status, 200);
    assert.equal((await started.json()).update.state, 'installing');
    assert.equal(again.status, 409);
    const refusal = (await again.json()).error;
    assert.equal(refusal.status, 'ABORTED');
    assert.equal(refusal.details[0].reason, 'UPDATE_IN_PROGRESS');
    const [command] = installer.calls;
    assert.equal(command[0], 'fake-npm');
    assert.deepEqual(command.slice(1, 3), ['install', '--prefix']);
    assert.match(command[3], /\/app$/);
    assert.deepEqual(command.slice(4), ['--no-audit', '--no-fund', '--no-save', '--ignore-scripts', 'whose-turn@1.0.0-alpha.3']);

    // Exercise
    installer.finish('');
    await settle();
    // Verify
    assert.equal(restarts, 1);
    assert.equal((await (await get('/api/state')).json()).update.state, 'restarting');
  } finally {
    server.close();
  }
});

test('a failed install keeps the old copy answering and reports failed with npm\'s message; a retry is allowed', async () => {
  // Setup
  const installer = deferredRun();
  let restarts = 0;
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: installer.run, restart: async () => { restarts += 1; } });
  await updater.check();
  const { server, post, get } = await startTestApi({ updater });
  try {
    // Exercise
    await post('/api/update', {});
    installer.finish('npm error code ETARGET No matching version found');
    await settle();
    // Verify
    const { update } = await (await get('/api/state')).json();
    assert.deepEqual(update, { current: '1.0.0-alpha.2', latest: '1.0.0-alpha.3', available: true, state: 'failed', reason: 'npm error code ETARGET No matching version found' });
    assert.equal(restarts, 0);
    assert.equal((await post('/api/update', {})).status, 200);
  } finally {
    server.close();
  }
});

test('POST /api/update with nothing to apply is refused as a failed precondition', async () => {
  // Setup
  const { server, post } = await startTestApi();
  try {
    // Exercise
    const response = await post('/api/update', {});
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 412);
    assert.equal(error.details[0].reason, 'UPDATE_UNAVAILABLE');
  } finally {
    server.close();
  }
});

test('the stream carries the update status first and every change after', async () => {
  // Setup
  const installer = deferredRun();
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: installer.run });
  await updater.check();
  const { server, url, post } = await startTestApi({ updater });
  const controller = new AbortController();
  try {
    const response = await fetch(url('/api/stream'), { signal: controller.signal });
    const reader = response.body.getReader();
    const next = async () => JSON.parse(new TextDecoder().decode((await reader.read()).value).replace(/^data: /, ''));
    // Exercise + Verify
    assert.equal((await next()).update.available, true);
    await post('/api/update', {});
    assert.equal((await next()).update.state, 'installing');
  } finally {
    controller.abort();
    server.close();
  }
});

test('the restart exits for a launch agent to bring the new copy back', async () => {
  // Setup
  const exits = [];
  const spawned = [];
  // Exercise
  await restartServer({ server: null, root: '/x', dataDir: scratch(), agent: () => ({ exitCode: 0 }), spawn: (...call) => spawned.push(call), exit: (code) => exits.push(code) });
  // Verify
  assert.deepEqual(exits, [0]);
  assert.deepEqual(spawned, []);
});

test('the restart without an agent frees the port, starts the new copy detached, then exits', async () => {
  // Setup
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const order = [];
  // Exercise
  await restartServer({
    server,
    root: '/data/app/node_modules/whose-turn',
    dataDir: scratch(),
    agent: () => null,
    spawn: (file, args, options) => { order.push(['spawn', server.listening, file, args, options.detached]); return { unref: () => {} }; },
    exit: (code) => order.push(['exit', code]),
  });
  // Verify
  assert.deepEqual(order, [['spawn', false, process.execPath, ['/data/app/node_modules/whose-turn/server.mjs'], true], ['exit', 0]]);
});

test('the agent probe recognises its own launchd job or systemd unit, and nothing else', () => {
  assert.deepEqual(probeAgent({ platform: 'darwin', env: { XPC_SERVICE_NAME: 'local.whose-turn' } }), { exitCode: 0 });
  assert.equal(probeAgent({ platform: 'darwin', env: { XPC_SERVICE_NAME: '0' } }), null);
  assert.deepEqual(probeAgent({ platform: 'linux', cgroup: () => '0::/user.slice/user@1000.service/app.slice/whose-turn.service\n' }), { exitCode: 75 });
  assert.equal(probeAgent({ platform: 'linux', cgroup: () => '0::/user.slice/session-2.scope\n' }), null);
  assert.equal(probeAgent({ platform: 'linux', cgroup: () => { throw new Error('no proc'); } }), null);
  assert.equal(probeAgent({ platform: 'win32' }), null);
});

test('a pinned install offers no update and says which version it is pinned to', async () => {
  // Setup
  const { updater, notes } = updaterWith({ latest: '1.0.0-alpha.3' }, { pinned: '1.0.0-alpha.2' });
  // Exercise
  const status = await updater.check();
  // Verify
  assert.deepEqual(status, { current: '1.0.0-alpha.2', latest: '1.0.0-alpha.3', available: false, state: 'idle', pinned: '1.0.0-alpha.2' });
  assert.deepEqual(notes, []);
});

test('POST /api/update on a pinned install is refused with PINNED and installs nothing', async () => {
  // Setup
  const installer = deferredRun();
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: installer.run, pinned: '1.0.0-alpha.2' });
  await updater.check();
  const { server, post } = await startTestApi({ updater });
  try {
    // Exercise
    const response = await post('/api/update', {});
    // Verify
    const error = (await response.json()).error;
    assert.equal(response.status, 412);
    assert.equal(error.details[0].reason, 'PINNED');
    assert.deepEqual(installer.calls, []);
  } finally {
    server.close();
  }
});

test('the pin is an exact version recorded by the install, else the one in the environment', () => {
  // Setup
  const withRecord = (spec) => {
    const dataDir = scratch();
    mkdirSync(join(dataDir, 'app'));
    writeFileSync(join(dataDir, 'app', 'package.json'), JSON.stringify({ dependencies: { 'whose-turn': spec } }));
    return dataDir;
  };
  // Exercise and verify
  assert.equal(pinnedVersion(withRecord('1.0.0-alpha.2'), {}), '1.0.0-alpha.2');
  assert.equal(pinnedVersion(withRecord('^1.0.0-alpha.2'), {}), '');
  assert.equal(pinnedVersion(withRecord('latest'), {}), '');
  assert.equal(pinnedVersion(scratch(), { WHOSE_TURN_APP_VERSION: '1.0.0-alpha.1' }), '1.0.0-alpha.1');
  assert.equal(pinnedVersion(withRecord('^1.0.0-alpha.2'), { WHOSE_TURN_APP_VERSION: '1.0.0-alpha.1' }), '1.0.0-alpha.1');
  assert.equal(pinnedVersion(scratch(), { WHOSE_TURN_APP_VERSION: 'latest' }), '');
  assert.equal(pinnedVersion(scratch(), {}), '');
});
