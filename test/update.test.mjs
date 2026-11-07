import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNEL, RELOAD_PLUGINS, createUpdater, findClaude, installedRoot, pinnedVersion, probeAgent, quitServer, restartServer, runsInstalled, updatePlugin, compareVersions, noUpdates, VERSION } from '../lib/update.mjs';
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
  assert.equal(asked[0], 'http://registry.test/-/package/whose-turn/dist-tags');
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

test('findClaude skips relative PATH entries, so a claude in the working directory never runs (RMA-416)', () => {
  // Setup
  const executable = (path) => path === 'bin/claude' || path === 'claude' || path === '/opt/bin/claude';
  // Exercise + Verify
  assert.equal(findClaude({ env: { PATH: 'bin::.:/opt/bin' }, home: '/home/me', platform: 'linux', executable }), '/opt/bin/claude');
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
    assert.deepEqual(update.plugin, { state: 'failed', copy: '/reload-plugins --force' });
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

test('a plugin whose skill knows an older monitor shows as behind until its command is copied; one that knows this monitor shows nothing (RMA-350)', () => {
  // Setup
  const updater = createUpdater({ http: null, dataDir: scratchDir('wt-plugin-behind-'), version: '1.0.0-beta.1', installed: true, notify: () => {}, restart: async () => {} });
  // Exercise
  const unseen = updater.status().plugin;
  updater.sawPlugin('1.0.14', '1.0.0-alpha.14');
  const behind = updater.status().plugin;
  updater.pluginCopied();
  const copied = updater.status().plugin;
  updater.sawPlugin('1.0.15', '1.0.0-beta.1');
  const current = updater.status().plugin;
  updater.sawPlugin('1.0.13');
  const old = updater.status().plugin;
  // Verify
  assert.equal(unseen, undefined);
  assert.deepEqual(behind, { state: 'behind', copy: '/reload-plugins --force', seen: '1.0.14', knows: '1.0.0-alpha.14' });
  assert.equal(copied, undefined);
  assert.equal(current, undefined);
  assert.equal(old, undefined);
});

test('the plugin headers of an API request reach the updater, and the summary says the plugin is behind (RMA-350)', async () => {
  // Setup
  const updater = createUpdater({ http: null, dataDir: scratchDir('wt-header-'), version: '1.0.0-beta.1', installed: false, notify: () => {}, restart: async () => {} });
  const api = await startTestApi({ updater });
  try {
    // Exercise
    await api.get('/api/summary', { headers: { 'X-Whose-Turn-Plugin': '1.0.14', 'X-Whose-Turn-Plugin-Knows': '1.0.0-alpha.14' } });
    // Verify
    assert.equal(updater.status().plugin.state, 'behind');
    assert.equal(updater.status().plugin.knows, '1.0.0-alpha.14');
  } finally {
    api.server.close();
  }
});

test('pluginCopied is a no-op that still returns the status: on a fresh data dir, for another version memo, and on a second call (RMA-361)', () => {
  // Setup
  const make = (dataDir) => createUpdater({ http: null, dataDir, version: '1.0.0-beta.1', installed: true, notify: () => {}, restart: async () => {} });
  const memoOf = (dataDir) => JSON.parse(readFileSync(join(dataDir, 'update.json'), 'utf8'));
  const fresh = scratchDir('wt-copied-fresh-');
  const other = scratchDir('wt-copied-other-');
  const otherMemo = { plugin: { for: '1.0.0-alpha.1', state: 'updated' } };
  writeFileSync(join(other, 'update.json'), JSON.stringify(otherMemo));
  const twice = scratchDir('wt-copied-twice-');
  writeFileSync(join(twice, 'update.json'), JSON.stringify({ plugin: { for: '1.0.0-beta.1', state: 'updated' } }));
  // Exercise
  const onFresh = make(fresh).pluginCopied();
  const onOther = make(other).pluginCopied();
  const updater = make(twice);
  const first = updater.pluginCopied();
  const afterFirst = memoOf(twice);
  const second = updater.pluginCopied();
  // Verify
  assert.equal(onFresh.plugin, undefined);
  assert.equal(existsSync(join(fresh, 'update.json')), false);
  assert.equal(onOther.plugin, undefined);
  assert.deepEqual(memoOf(other), otherMemo);
  assert.equal(first.plugin, undefined);
  assert.deepEqual(afterFirst.plugin, { for: '1.0.0-beta.1', state: 'updated', copied: true });
  assert.equal(second.plugin, undefined);
  assert.deepEqual(memoOf(twice), afterFirst);
});

test('only a plain semver version, with an optional prerelease, matches VERSION', () => {
  // Setup
  const good = ['1.0.0', '10.20.30', '1.0.0-alpha.2', '1.0.0-rc-1'];
  const bad = ['1.0.0 ', 'v1.0.0', '1.0', '1.0.0; rm', '1.0.0-', 'x1.0.0', '1.0.0\n'];
  // Exercise
  const accepted = good.filter((value) => VERSION.test(value));
  const refused = bad.filter((value) => VERSION.test(value));
  // Verify
  assert.deepEqual(accepted, good);
  assert.deepEqual(refused, []);
});

test('multi-digit version parts match VERSION in every position', () => {
  // Setup
  const values = ['12.0.0', '1.12.0', '1.0.12'];
  // Exercise
  const matches = values.map((value) => VERSION.test(value));
  // Verify
  assert.deepEqual(matches, [true, true, true]);
});

test('the pin ignores a package.json without dependencies and a spec that is not a string', () => {
  // Setup
  const bare = scratch();
  mkdirSync(join(bare, 'app'), { recursive: true });
  writeFileSync(join(bare, 'app', 'package.json'), 'null');
  const odd = scratch();
  mkdirSync(join(odd, 'app'), { recursive: true });
  writeFileSync(join(odd, 'app', 'package.json'), JSON.stringify({ dependencies: { 'whose-turn': ['1.2.3'] } }));
  // Exercise
  const withoutDependencies = pinnedVersion(bare, {});
  const arraySpec = pinnedVersion(odd, {});
  // Verify
  assert.equal(withoutDependencies, '');
  assert.equal(arraySpec, '');
});

test('the agent probe answers null off linux and darwin even when a systemd-looking cgroup is on offer', () => {
  // Setup
  const cgroup = () => '0::/user.slice/whose-turn.service\n';
  // Exercise
  const windows = probeAgent({ platform: 'win32', cgroup });
  const unreadable = probeAgent({ platform: 'linux', cgroup: () => { throw new Error('no proc'); } });
  // Verify
  assert.equal(windows, null);
  assert.equal(unreadable, null);
});

test('findClaude by default accepts an executable file and refuses one without the execute bit', () => {
  // Setup
  const bin = scratch();
  const home = scratch();
  writeFileSync(join(bin, 'claude'), '');
  chmodSync(join(bin, 'claude'), 0o644);
  const plain = findClaude({ env: { PATH: bin }, home, platform: 'linux' });
  chmodSync(join(bin, 'claude'), 0o755);
  // Exercise
  const found = findClaude({ env: { PATH: bin }, home, platform: 'linux' });
  // Verify
  assert.notEqual(plain, join(bin, 'claude'));
  assert.equal(found, join(bin, 'claude'));
});

test('a restart without an agent closes lingering connections, logs to server.log and detaches the child', async () => {
  // Setup
  const dataDir = scratch();
  const calls = [];
  const server = { close: (done) => { calls.push('close'); done(); }, closeAllConnections: () => calls.push('closeAll') };
  let options;
  // Exercise
  await restartServer({ server, root: '/app', dataDir, agent: () => null, spawn: (file, args, given) => { options = given; return { unref: () => calls.push('unref') }; }, exit: () => calls.push('exit') });
  // Verify
  assert.deepEqual(calls, ['close', 'closeAll', 'unref', 'exit']);
  assert.equal(options.detached, true);
  assert.equal(options.cwd, '/app');
  assert.equal(options.stdio[0], 'ignore');
  assert.equal(typeof options.stdio[1], 'number');
  assert.equal(options.stdio[1], options.stdio[2]);
  assert.ok(existsSync(join(dataDir, 'server.log')));
});

test('quitting detaches the launchctl call with ignored stdio', () => {
  // Setup
  let options;
  // Exercise
  quitServer({ agent: () => ({ exitCode: 0 }), platform: 'darwin', uid: 501, spawn: (file, args, given) => { options = given; return { unref: () => {} }; }, exit: () => {} });
  // Verify
  assert.deepEqual(options, { detached: true, stdio: 'ignore' });
});

test('prerelease identifiers compare part by part: a shorter list is older, numbers by value, words by letters', () => {
  // Setup
  const cases = [
    ['1.0.0-alpha', '1.0.0-alpha.1', -1],
    ['1.0.0-alpha.1', '1.0.0-alpha', 1],
    ['1.0.0-alpha.1', '1.0.0-alpha.1.2', -1],
    ['1.0.0-alpha.1.2', '1.0.0-alpha.1', 1],
    ['1.0.0-rc.1', '1.0.0-rc.1', 0],
    ['1.0.0-alpha', '1.0.0-beta', -1],
    ['1.0.0-beta', '1.0.0-alpha', 1],
    ['1.0.0-1', '1.0.0-alpha', -1],
    ['1.0.0-alpha', '1.0.0-1', 1],
    ['1.0.0-1a', '1.0.0-2', -1],
    ['1.0.0-a1', '1.0.0-2', 1],
    ['1.0.0-10', '1.0.0-9', 1],
    ['1.0.0-9', '1.0.0-10', -1],
  ];
  // Exercise
  const results = cases.map(([first, second]) => Math.sign(compareVersions(first, second)));
  // Verify
  assert.deepEqual(results, cases.map((entry) => entry[2]));
});

test('a plugin that knows exactly this monitor, or a newer one, is never behind', () => {
  for (const knows of ['1.0.0-beta.1', '1.0.0', '2.0.0']) {
    // Setup
    const updater = createUpdater({ http: null, dataDir: scratch(), version: '1.0.0-beta.1', installed: true, notify: () => {}, restart: async () => {} });
    // Exercise
    updater.sawPlugin('1.0.15', knows);
    // Verify
    assert.equal(updater.status().plugin, undefined, knows);
  }
});

test('the updater announces a plugin sighting only when the seen or known version changes', () => {
  // Setup
  const updater = createUpdater({ http: null, dataDir: scratch(), version: '1.0.0', installed: true, notify: () => {}, restart: async () => {} });
  const heard = [];
  updater.subscribe((message) => heard.push(message));
  // Exercise
  updater.sawPlugin('1.0.1', '0.9.0');
  updater.sawPlugin('1.0.1', '0.9.0');
  const afterRepeat = heard.length;
  updater.sawPlugin('1.0.2', '0.9.0');
  const afterSeen = heard.length;
  updater.sawPlugin('1.0.2', '0.9.1');
  const afterKnows = heard.length;
  updater.sawPlugin('', '');
  // Verify
  assert.equal(afterRepeat, 1);
  assert.equal(afterSeen, 2);
  assert.equal(afterKnows, 3);
  assert.equal(heard.length, 4);
  assert.equal(heard[3].update.plugin, undefined);
  assert.equal(updater.pluginSeen(), '');
});

test('pluginSeen answers the last valid plugin version', () => {
  // Setup
  const updater = createUpdater({ http: null, dataDir: scratch(), version: '1.0.0', installed: true, notify: () => {}, restart: async () => {} });
  // Exercise
  updater.sawPlugin('1.2.3', '1.0.0');
  // Verify
  assert.equal(updater.pluginSeen(), '1.2.3');
});

test('a subscriber stops hearing after it unsubscribes', () => {
  // Setup
  const updater = createUpdater({ http: null, dataDir: scratch(), version: '1.0.0', installed: true, notify: () => {}, restart: async () => {} });
  let heard = 0;
  const unsubscribe = updater.subscribe(() => { heard += 1; });
  // Exercise
  updater.sawPlugin('1.0.1', '');
  unsubscribe();
  updater.sawPlugin('1.0.2', '');
  // Verify
  assert.equal(heard, 1);
});

test('a dist-tag that is not a string is ignored, and an unchanged tag announces nothing more', async () => {
  // Setup
  const bad = updaterWith({ latest: ['1.0.0-alpha.3'] });
  const same = updaterWith({ latest: '1.0.0-alpha.3' });
  const heard = [];
  same.updater.subscribe((message) => heard.push(message));
  // Exercise
  const ignored = await bad.updater.check();
  await same.updater.check();
  await same.updater.check();
  // Verify
  assert.equal(ignored.latest, '');
  assert.deepEqual(bad.notes, []);
  assert.equal(heard.length, 1);
});

test('apply during an install is refused with the state, and a pinned or idle updater with its own facts', async () => {
  // Setup
  const installer = deferredRun();
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: installer.run });
  await updater.check();
  const pinned = updaterWith({ latest: '1.0.0-alpha.3' }, { pinned: '1.0.0-alpha.2' });
  const idle = updaterWith({ latest: '1.0.0-alpha.2' });
  await idle.updater.check();
  const attempt = (target) => { try { target.apply(); } catch (error) { return error; } return null; };
  // Exercise
  updater.apply();
  const busy = attempt(updater);
  const pin = attempt(pinned.updater);
  const nothing = attempt(idle.updater);
  // Verify
  assert.equal(busy.reason, 'UPDATE_IN_PROGRESS');
  assert.deepEqual(busy.metadata, { state: 'installing' });
  assert.equal(pin.reason, 'PINNED');
  assert.deepEqual(pin.metadata, { pinned: '1.0.0-alpha.2' });
  assert.equal(nothing.reason, 'UPDATE_UNAVAILABLE');
  assert.deepEqual(nothing.metadata, { current: '1.0.0-alpha.2', latest: '1.0.0-alpha.2' });
});

test('apply is refused while the restart is under way', async () => {
  // Setup
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: async () => '', restart: () => new Promise(() => {}) });
  await updater.check();
  updater.apply();
  await settle();
  // Exercise
  const attempt = () => updater.apply();
  // Verify
  assert.equal(updater.status().state, 'restarting');
  assert.throws(attempt, (error) => error.reason === 'UPDATE_IN_PROGRESS' && error.metadata.state === 'restarting');
});

test('a restart that throws leaves the updater failed with the error message, or the thrown value', async () => {
  for (const [thrown, reason] of [[new Error('boom'), 'boom'], ['plain text', 'plain text']]) {
    // Setup
    const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: async () => '', restart: async () => { throw thrown; } });
    await updater.check();
    // Exercise
    updater.apply();
    await settle();
    // Verify
    assert.deepEqual(updater.status(), { current: '1.0.0-alpha.2', latest: '1.0.0-alpha.3', available: true, state: 'failed', reason });
  }
});

test('a plugin step that throws is remembered as failed for this version', async () => {
  // Setup
  const dataDir = scratch();
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { dataDir, run: async () => '', plugin: async () => { throw new Error('boom'); } });
  await updater.check();
  // Exercise
  updater.apply();
  await settle();
  const memo = JSON.parse(readFileSync(join(dataDir, 'update.json'), 'utf8'));
  // Verify
  assert.equal(memo.plugin.state, 'failed');
  assert.equal(memo.plugin.for, '1.0.0-alpha.3');
});

test('start checks the registry at once and again every ten minutes', async (context) => {
  // Setup
  context.mock.timers.enable({ apis: ['setInterval'] });
  const { updater, asked } = updaterWith({ latest: '1.0.0-alpha.2' });
  // Exercise
  updater.start();
  const first = asked.length;
  context.mock.timers.tick(10 * 60 * 1000 - 1);
  const early = asked.length;
  context.mock.timers.tick(1);
  // Verify
  assert.equal(first, 1);
  assert.equal(early, 1);
  assert.equal(asked.length, 2);
});

test('noUpdates is idle: it never asks a registry and offers nothing', async () => {
  // Setup
  const updater = noUpdates();
  // Exercise
  const status = await updater.check();
  // Verify
  assert.deepEqual(status, { current: '', latest: '', available: false, state: 'idle' });
});

/** An executable stand-in for npm or claude: records its argv beside itself, then writes `stdout`, `stderr`, waits `delay` ms and exits with `code`. */
const fakeTool = ({ stdout = '', stderr = '', code = 0, delay = 0 } = {}) => {
  const dir = scratch();
  const path = join(dir, 'tool');
  const body = [
    `#!${process.execPath}`,
    "const { writeFileSync } = require('node:fs');",
    `writeFileSync(${JSON.stringify(join(dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));`,
    `process.stdout.write(${JSON.stringify(stdout)}, () => process.stderr.write(${JSON.stringify(stderr)}, () => setTimeout(() => process.exit(${code}), ${delay})));`,
  ].join('\n');
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return { path, argv: () => JSON.parse(readFileSync(join(dir, 'argv.json'), 'utf8')) };
};

/** Applies the update through the real npm runner against `tool` and waits for it to finish. */
const installWith = async (tool, extra = {}) => {
  const dataDir = scratch();
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { dataDir, npm: tool.path, restart: async () => {}, ...extra });
  await updater.check();
  updater.apply();
  for (let waited = 0; waited < 100 && updater.status().state === 'installing'; waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { status: updater.status(), dataDir };
};

test('the install runs npm with the exact argument list and, on exit 0, moves on to the restart', async () => {
  // Setup
  const tool = fakeTool();
  // Exercise
  const { status, dataDir } = await installWith(tool);
  // Verify
  assert.equal(status.state, 'restarting');
  assert.deepEqual(tool.argv(), ['install', '--prefix', join(dataDir, 'app'), '--no-audit', '--no-fund', '--no-save', '--ignore-scripts', 'whose-turn@1.0.0-alpha.3']);
});

test('a failed npm reports its last three non-empty lines, trimmed and joined', async () => {
  // Setup
  const tool = fakeTool({ stderr: 'one\ntwo\n  three  \n\nfour\n  five \n', code: 1 });
  // Exercise
  const { status } = await installWith(tool);
  // Verify
  assert.equal(status.state, 'failed');
  assert.equal(status.reason, 'three four five');
});

test('a failed npm that wrote only to stdout reports stdout; with both streams it reports stderr', async () => {
  // Setup
  const onlyOut = fakeTool({ stdout: 'from stdout', code: 1 });
  const both = fakeTool({ stdout: 'from stdout', stderr: 'from stderr', code: 1 });
  // Exercise
  const out = await installWith(onlyOut);
  const err = await installWith(both);
  // Verify
  assert.equal(out.status.reason, 'from stdout');
  assert.equal(err.status.reason, 'from stderr');
});

test('a failed npm that wrote nothing reports the process error', async () => {
  // Setup
  const tool = fakeTool({ code: 3 });
  // Exercise
  const { status } = await installWith(tool);
  // Verify
  assert.equal(status.state, 'failed');
  assert.ok(status.reason.startsWith('Command failed'), status.reason);
});

test('a failed npm message is cut to 400 characters', async () => {
  // Setup
  const tool = fakeTool({ stderr: 'x'.repeat(1000), code: 1 });
  // Exercise
  const { status } = await installWith(tool);
  // Verify
  assert.equal(status.reason.length, 400);
});

test('npm output of a few megabytes does not fail the install, and a slow npm is not cut short', async () => {
  // Setup
  const loud = fakeTool({ stdout: 'y'.repeat(2 * 1024 * 1024) });
  const slow = fakeTool({ delay: 400 });
  // Exercise
  const noisy = await installWith(loud);
  const waited = await installWith(slow);
  // Verify
  assert.equal(noisy.status.state, 'restarting');
  assert.equal(waited.status.state, 'restarting');
});

test('the plugin step runs claude plugin update with its fixed arguments and answers updated on exit 0', async () => {
  // Setup
  const tool = fakeTool();
  // Exercise
  const answer = await updatePlugin({ find: () => tool.path });
  // Verify
  assert.equal(answer, 'updated');
  assert.deepEqual(tool.argv(), ['plugin', 'update', 'whose-turn@bladeforge']);
});

test('the plugin step answers failed on a non-zero exit, and tolerates output and a slow run', async () => {
  // Setup
  const broken = fakeTool({ code: 1 });
  const slow = fakeTool({ stdout: 'z'.repeat(5000), delay: 400 });
  // Exercise
  const failed = await updatePlugin({ find: () => broken.path });
  const updated = await updatePlugin({ find: () => slow.path });
  // Verify
  assert.equal(failed, 'failed');
  assert.equal(updated, 'updated');
});

test('a restart that throws nothing at all still reports failed', async () => {
  // Setup
  const { updater } = updaterWith({ latest: '1.0.0-alpha.3' }, { run: async () => '', restart: async () => { throw null; } });
  await updater.check();
  // Exercise
  updater.apply();
  await settle();
  // Verify
  assert.equal(updater.status().state, 'failed');
  assert.equal(updater.status().reason, 'null');
});

test('a prerelease part compares as a word when either side is not a plain number', () => {
  // Setup
  const cases = [['1.0.0-2', '1.0.0-a1', -1], ['1.0.0-2', '1.0.0-1a', 1], ['1.0.0-1a', '1.0.0-2', -1]];
  // Exercise
  const results = cases.map(([first, second]) => Math.sign(compareVersions(first, second)));
  // Verify
  assert.deepEqual(results, cases.map((entry) => entry[2]));
});
