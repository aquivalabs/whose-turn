import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureRunning, staleAgent } from '../bin/ensure-running.mjs';

const attempt = async ({ platform, present = [], up = false, failing = [], answersAfter = 1, agentText = '' }) => {
  const calls = [];
  let probes = 0;
  const result = await ensureRunning({
    platform,
    home: '/home/u',
    uid: 501,
    exists: (path) => present.includes(path),
    read: () => agentText,
    root: ROOT,
    wait: async () => {},
    probe: async () => (up ? true : calls.length > 0 && ++probes > answersAfter),
    run: (file, args, options) => {
      calls.push([file, args, options]);
      return !failing.includes(file);
    },
  });
  return { calls, result };
};

const PLIST = '/home/u/Library/LaunchAgents/local.whose-turn.plist';
const CACHE = '/home/u/.claude/plugins/cache/whose-turn/whose-turn';
const ROOT = `${CACHE}/0.3.0`;
const plistFor = (server) => `<array><string>/usr/bin/node</string><string>${server}</string></array>`;
const UNIT = '/home/u/.config/systemd/user/whose-turn.service';

test('a running monitor is left alone', async () => {
  const { calls, result } = await attempt({ platform: 'darwin', up: true });
  assert.deepEqual(calls, []);
  assert.equal(result, true);
});

test('macOS with the plist: launchctl kickstart of the agent', async () => {
  const { calls, result } = await attempt({ platform: 'darwin', present: [PLIST] });
  assert.deepEqual(calls, [['launchctl', ['kickstart', 'gui/501/local.whose-turn'], undefined]]);
  assert.equal(result, true);
});

test('macOS with the plist, kickstart refused: bootstrap next', async () => {
  const { calls } = await attempt({ platform: 'darwin', present: [PLIST], failing: ['launchctl'] });
  assert.equal(calls[1][0], 'launchctl');
  assert.deepEqual(calls[1][1], ['bootstrap', 'gui/501', PLIST]);
  assert.equal(calls[2][2].detached, true);
});

test('macOS without the plist: detached server', async () => {
  const { calls } = await attempt({ platform: 'darwin' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.match(calls[0][1][0], /server\.mjs$/);
  assert.deepEqual(calls[0][2], { detached: true });
});

test('Linux with the unit: systemctl --user start', async () => {
  const { calls } = await attempt({ platform: 'linux', present: [UNIT] });
  assert.deepEqual(calls, [['systemctl', ['--user', 'start', 'whose-turn'], undefined]]);
});

test('Linux without the unit: detached server', async () => {
  const { calls } = await attempt({ platform: 'linux' });
  assert.equal(calls[0][2].detached, true);
});

test('Windows: detached server', async () => {
  const { calls } = await attempt({ platform: 'win32' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].detached, true);
});

test('a monitor that never answers reports false', async () => {
  const { result } = await attempt({ platform: 'win32', answersAfter: 99 });
  assert.equal(result, false);
});

test('an agent installed from this plugin root is not touched', () => {
  assert.equal(staleAgent(plistFor(`${ROOT}/server.mjs`), ROOT, () => true), false);
});

test('an agent left by an earlier plugin version, still on disk, is stale', () => {
  assert.equal(staleAgent(plistFor(`${CACHE}/0.2.0/server.mjs`), ROOT, () => true), true);
});

test('an agent whose server.mjs is gone is stale; one from a live git clone is not', () => {
  assert.equal(staleAgent('ExecStart="/usr/bin/node" "/old/clone/server.mjs"', ROOT, () => false), true);
  assert.equal(staleAgent(plistFor('/home/u/src/whose-turn/server.mjs'), ROOT, () => true), false);
});

test('macOS with a stale plist and the monitor up: install.sh from this root rewrites it, nothing else runs', async () => {
  const { calls, result } = await attempt({ platform: 'darwin', present: [PLIST, `${CACHE}/0.2.0/server.mjs`], up: true, agentText: plistFor(`${CACHE}/0.2.0/server.mjs`) });
  assert.deepEqual(calls, [['bash', [`${ROOT}/install.sh`], undefined]]);
  assert.equal(result, true);
});
