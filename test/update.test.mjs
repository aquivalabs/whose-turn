import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNEL, RELOAD_PLUGINS, createUpdater, findClaude, installedRoot, pinnedVersion, probeAgent, quitServer, restartServer, runsInstalled, updatePlugin, compareVersions } from '../lib/update.mjs';
import { startTestApi } from './fixtures/api.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const scratch = () => scratchDir('wt-update-');

/** A plugin step that touches nothing, so no test can reach the real Claude CLI. */
const idlePlugin = async () => 'manual';

/** An updater on a scratch data dir whose registry answers `tags`, or fails when `tags` is an Error. */
const updaterWith = (tags, extra = {}) => {
  const notes = [];
  const asked = [];
  const http = { fetchJson: async (url) => { asked.push(url); if (tags instanceof Error) {throw tags;} return tags; } };
  const updater = createUpdater({ http, dataDir: scratch(), version: '1.0.0-alpha.2', installed: true, notify: (title, body) => notes.push([title, body]), registry: 'http://registry.test', restart: async () => {}, plugin: idlePlugin, ...extra });
  return { updater, notes, asked };
};

test('a newer version under the channel tag is offered and announced once', async () => {
  // Setup
  const { updater, notes, asked } = updaterWith({ latest: '1.0.0-alpha.3', alpha: '1.0.0-alpha.3' });
  // Exercise
  const first = await updater.check();
  await updater.check();
  // Verify
  assert.deepEqual(asked.slice(0, 2), ['https://raw.githubusercontent.com/aquivalabs/BladeForge/main/plugins/whose-turn/.claude-plugin/plugin.json', 'http://registry.test/-/package/whose-turn/dist-tags']);
  assert.deepEqual(first, { current: '1.0.0-alpha.2', latest: '1.0.0-alpha.3', available: true, state: 'idle' });
  assert.deepEqual(notes, [['Whose Turn 1.0.0-alpha.3 is out', 'Update from the window.']]);
});

test('the announcement is remembered across a restart of the server', async () => {
  // Setup
  const dataDir = scratch();
  const notes = [];
  const make = () => createUpdater({ http: { fetchJson: async () => ({ latest: '1.0.0-alpha.3' }) }, dataDir, version: '1.0.0-alpha.2', installed: true, notify: (title) => notes.push(title), restart: async () => {}, plugin: idlePlugin });
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

test('a checkout never asks the registry and is never offered an update; it still reads the plugin version', async () => {
  // Setup
  const { updater, asked } = updaterWith({ latest: '1.0.0-alpha.3' }, { installed: false });
  // Exercise
  const status = await updater.check();
  // Verify
  assert.deepEqual(asked, ['https://raw.githubusercontent.com/aquivalabs/BladeForge/main/plugins/whose-turn/.claude-plugin/plugin.json']);
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

/** Lets the install, the plugin step and the restart that follow a POST run to their end. */
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

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

test('the Claude CLI is found on PATH first, then in the usual install places, else not at all', () => {
  // Setup
  const present = new Set(['/opt/bin/claude', '/home/me/.local/bin/claude', '/usr/local/bin/claude']);
  const executable = (path) => present.has(path);
  // Exercise + Verify
  assert.equal(findClaude({ env: { PATH: '/bin:/opt/bin' }, home: '/home/me', platform: 'linux', executable }), '/opt/bin/claude');
  assert.equal(findClaude({ env: { PATH: '/bin' }, home: '/home/me', platform: 'linux', executable }), '/home/me/.local/bin/claude');
  assert.equal(findClaude({ env: {}, home: '/nobody', platform: 'linux', executable }), '/usr/local/bin/claude');
  assert.equal(findClaude({ env: {}, home: '/nobody', platform: 'linux', executable: () => false }), '');
  assert.equal(findClaude({ env: { PATH: '/opt/bin' }, home: '/home/me', platform: 'win32', executable: (path) => path === '/opt/bin/claude.exe' }), '/opt/bin/claude.exe');
});

test('the plugin step runs the one fixed command and reports updated, manual or failed', async () => {
  // Setup
  const ran = [];
  const ok = (claude) => { ran.push(claude); return Promise.resolve(''); };
  // Exercise + Verify
  assert.equal(await updatePlugin({ find: () => '/x/claude', run: ok }), 'updated');
  assert.deepEqual(ran, ['/x/claude']);
  assert.equal(await updatePlugin({ find: () => '', run: ok }), 'manual');
  assert.equal(await updatePlugin({ find: () => '/x/claude', run: async () => 'exit 1' }), 'failed');
});

test('after the install the plugin result rides in the status of the restarted server, and a failed monitor install never touches the plugin', async () => {
  // Setup
  const dataDir = scratch();
  const calls = [];
  const make = (version, extra = {}) => createUpdater({ http: { fetchJson: async () => ({ latest: '1.0.0-alpha.3' }) }, dataDir, version, installed: true, notify: () => {}, restart: async () => {}, run: async () => '', plugin: async () => { calls.push('plugin'); return 'updated'; }, ...extra });
  const failing = make('1.0.0-alpha.2', { run: async () => 'npm broke' });
  await failing.check();
  // Exercise
  failing.apply();
  await settle();
  // Verify
  assert.deepEqual(calls, []);
  assert.equal(failing.status().plugin, undefined);
  // Exercise
  const updating = make('1.0.0-alpha.2');
  await updating.check();
  updating.apply();
  await settle();
  // Verify
  assert.deepEqual(calls, ['plugin']);
  assert.equal(updating.status().plugin, undefined);
  assert.deepEqual(make('1.0.0-alpha.3').status().plugin, { state: 'updated', copy: RELOAD_PLUGINS });
  assert.equal(make('1.0.0-alpha.4').status().plugin, undefined);
});

test('/api/state offers the command to copy, and POST /api/update/plugin-copied retires the chip for every window', async () => {
  // Setup
  const dataDir = scratch();
  writeFileSync(join(dataDir, 'update.json'), JSON.stringify({ plugin: { for: '1.0.0-alpha.2', state: 'failed' } }));
  const make = () => createUpdater({ http: null, dataDir, version: '1.0.0-alpha.2', installed: true, notify: () => {}, restart: async () => {}, plugin: idlePlugin });
  const updater = make();
  const announced = [];
  updater.subscribe((event) => announced.push(event.update));
  const { server, get, post } = await startTestApi({ updater });
  try {
    // Exercise
    const { update } = await (await get('/api/state')).json();
    const copied = await (await post('/api/update/plugin-copied', {})).json();
    // Verify
    assert.deepEqual(update.plugin, { state: 'failed', copy: 'claude plugin update whose-turn@bladeforge' });
    assert.equal(copied.update.plugin, undefined);
    assert.equal(announced.at(-1).plugin, undefined);
    assert.equal(make().status().plugin, undefined);
  } finally {
    server.close();
  }
});

test('a plugin step that fails or throws never fails the monitor update', async () => {
  for (const plugin of [async () => 'failed', async () => { throw new Error('boom'); }]) {
    // Setup
    let restarts = 0;
    const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: async () => '', plugin, restart: async () => { restarts += 1; } });
    await updater.check();
    // Exercise
    updater.apply();
    await settle();
    // Verify
    assert.equal(restarts, 1);
    assert.equal(updater.status().state, 'restarting');
  }
});

test('quitting under launchd unloads its own agent so KeepAlive does not bring it back; elsewhere it only exits 0 (RMA-356)', () => {
  // Setup
  const run = (agent, platform) => {
    const spawned = [];
    const exits = [];
    quitServer({ agent: () => agent, platform, uid: 501, spawn: (file, args) => { spawned.push([file, ...args]); return { unref: () => {} }; }, exit: (code) => exits.push(code) });
    return { spawned, exits };
  };
  // Exercise
  const launchd = run({ exitCode: 0 }, 'darwin');
  const systemd = run({ exitCode: 75 }, 'linux');
  const plain = run(null, 'darwin');
  // Verify
  assert.deepEqual(launchd, { spawned: [['launchctl', 'bootout', 'gui/501/local.whose-turn']], exits: [0] });
  assert.deepEqual(systemd, { spawned: [], exits: [0] });
  assert.deepEqual(plain, { spawned: [], exits: [0] });
});

test('POST /api/quit and /api/restart answer first, tell every open window, then act (RMA-356)', async () => {
  // Setup
  const acted = [];
  const api = await startTestApi({ lifecycle: { quit: () => acted.push('quit'), restart: async () => acted.push('restart') } });
  const stream = await fetch(api.url('/api/stream'));
  const reader = stream.body.getReader();
  try {
    // Exercise
    const quit = await (await api.post('/api/quit', {})).json();
    const restart = await (await api.post('/api/restart', {})).json();
    await new Promise((resolve) => setTimeout(resolve, 250));
    let seen = '';
    while (!seen.includes('restarting')) {
      seen += new TextDecoder().decode((await reader.read()).value);
    }
    // Verify
    assert.deepEqual([quit, restart], [{ lifecycle: 'quitting' }, { lifecycle: 'restarting' }]);
    assert.deepEqual(acted, ['quit', 'restart']);
    assert.match(seen, /"lifecycle":"quitting"/);
  } finally {
    await reader.cancel();
    api.server.closeAllConnections();
    api.server.close();
  }
});

test('versions compare by number, and a release outranks its prereleases (RMA-350)', () => {
  // Setup
  const sorted = ['1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-beta.1', '1.0.0', '1.0.12', '1.0.13', '1.1.0'];
  // Exercise
  const pairs = sorted.slice(1).map((newer, index) => compareVersions(sorted[index], newer));
  // Verify
  assert.ok(pairs.every((difference) => difference < 0), JSON.stringify(pairs));
  assert.equal(compareVersions('1.0.13', '1.0.13'), 0);
});

test('a running plugin older than the marketplace one shows as behind until its command is copied; a current one shows nothing (RMA-350)', async () => {
  // Setup
  const dataDir = scratchDir('wt-plugin-behind-');
  const http = { fetchJson: async (url) => (url.includes('plugin.json') ? { version: '1.0.14' } : { latest: '1.0.0-alpha.2' }) };
  const updater = createUpdater({ http, dataDir, version: '1.0.0-alpha.2', installed: true, notify: () => {}, restart: async () => {}, pluginManifest: 'https://example.test/plugin.json' });
  // Exercise
  await updater.check();
  const unseen = updater.status().plugin;
  updater.sawPlugin('1.0.12');
  const behind = updater.status().plugin;
  updater.pluginCopied();
  const copied = updater.status().plugin;
  updater.sawPlugin('1.0.14');
  const current = updater.status().plugin;
  // Verify
  assert.equal(unseen, undefined);
  assert.deepEqual(behind, { state: 'behind', copy: 'claude plugin update whose-turn@bladeforge', seen: '1.0.12', latest: '1.0.14' });
  assert.equal(copied, undefined);
  assert.equal(current, undefined);
});

test('the X-Whose-Turn-Plugin header of an API request reaches the updater once per new version (RMA-350)', async () => {
  // Setup
  const seen = [];
  const updater = { ...createUpdater({ http: null, dataDir: scratchDir('wt-header-'), version: '1.0.0', installed: false, notify: () => {}, restart: async () => {} }), sawPlugin: (version) => seen.push(version) };
  const api = await startTestApi({ updater });
  try {
    // Exercise
    await api.get('/api/summary', { headers: { 'X-Whose-Turn-Plugin': '1.0.13' } });
    await api.get('/api/summary', { headers: { 'X-Whose-Turn-Plugin': '1.0.13' } });
    await api.get('/api/summary', { headers: { 'X-Whose-Turn-Plugin': '1.0.14' } });
    // Verify
    assert.deepEqual(seen, ['1.0.13', '1.0.14']);
  } finally {
    api.server.close();
  }
});
