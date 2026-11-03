import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// The script runs from a copy laid out like the installed package, in a folder whose path has a space.
const harness = (kernel, { built = true } = {}) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'wt-install-')));
  const bin = join(home, 'stub-bin');
  const log = join(home, 'calls.log');
  const root = join(home, 'plugin data', 'node_modules', 'whose-turn');
  mkdirSync(bin);
  mkdirSync(root, { recursive: true });
  copyFileSync(join(ROOT, 'install.sh'), join(root, 'install.sh'));
  copyFileSync(join(ROOT, 'launch.sh'), join(root, 'launch.sh'));
  if (built) {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>');
  }
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub('uname', `echo ${kernel}`);
  stub('node', 'exit 0');
  for (const name of ['systemctl', 'launchctl']) {
    stub(name, `echo "${name} $*" >> "${log}"`);
  }
  const install = (env = {}) =>
    execFileSync('bash', [join(root, 'install.sh')], { env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, ...env }, encoding: 'utf8' });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
  return { home, bin, root, install, calls, cleanup: () => rmSync(home, { recursive: true, force: true }) };
};

test('Linux: writes a systemd user unit that starts the launcher, records the install-time node as a hint and enables it', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Linux');
  t.after(h.cleanup);
  const output = h.install();
  const unit = readFileSync(join(h.home, '.config/systemd/user/whose-turn.service'), 'utf8');
  assert.match(unit, new RegExp(`^ExecStart=/bin/bash "${h.root}/launch.sh"$`, 'm'));
  assert.match(unit, new RegExp(`^Environment="WHOSE_TURN_NODE=${h.bin}/node"$`, 'm'));
  assert.match(unit, new RegExp(`^WorkingDirectory=${h.root}$`, 'm'));
  assert.match(unit, new RegExp(`^Environment=PATH=${h.bin}:`, 'm'));
  assert.match(unit, /^Restart=on-failure$/m);
  assert.match(unit, /^WantedBy=default.target$/m);
  assert.deepEqual(h.calls(), ['systemctl --user daemon-reload', 'systemctl --user enable --now whose-turn']);
  assert.match(output, /http:\/\/127\.0\.0\.1:8765\//);
});

test('macOS: writes the launch agent plist and bootstraps it', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Darwin');
  t.after(h.cleanup);
  h.install();
  const plist = readFileSync(join(h.home, 'Library/LaunchAgents/local.whose-turn.plist'), 'utf8');
  assert.match(plist, new RegExp(`<string>/bin/bash</string><string>${h.root}/launch.sh</string>`));
  assert.match(plist, new RegExp(`<key>WHOSE_TURN_NODE</key><string>${h.bin}/node</string>`));
  assert.match(plist, new RegExp(`<key>WorkingDirectory</key><string>${h.root}</string>`));
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/);
  const calls = h.calls();
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^launchctl bootout gui\/\d+ .*local\.whose-turn\.plist$/);
  assert.match(calls[1], /^launchctl bootstrap gui\/\d+ .*local\.whose-turn\.plist$/);
});

test('another platform: prints the schtasks line and installs nothing', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('MINGW64_NT');
  t.after(h.cleanup);
  assert.throws(() => h.install(), (error) => error.status === 1 && /schtasks \/Create \/SC ONLOGON/.test(error.stdout));
  assert.deepEqual(h.calls(), []);
});

test('a copy without the built window: refuses with one line and installs nothing', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Darwin', { built: false });
  t.after(h.cleanup);
  assert.throws(() => h.install(), (error) => error.status === 1 && /dist\/index\.html is missing\. A released whose-turn package carries it/.test(error.stdout));
  assert.equal(existsSync(join(h.home, 'Library/LaunchAgents/local.whose-turn.plist')), false);
  assert.deepEqual(h.calls(), []);
});

test('Linux: WHOSE_TURN_DATA and WHOSE_TURN_PORT set at install time land in the unit and the Installed line', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Linux');
  t.after(h.cleanup);
  const output = h.install({ WHOSE_TURN_DATA: '/tmp/my data', WHOSE_TURN_PORT: '8801' });
  const unit = readFileSync(join(h.home, '.config/systemd/user/whose-turn.service'), 'utf8');
  assert.match(unit, /^Environment="WHOSE_TURN_DATA=\/tmp\/my data"$/m);
  assert.match(unit, /^Environment="WHOSE_TURN_PORT=8801"$/m);
  assert.match(output, /WHOSE_TURN_DATA WHOSE_TURN_PORT from this shell are written into it\./);
});

test('macOS: WHOSE_TURN_PORT set at install time lands in the plist, an unset variable does not', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Darwin');
  t.after(h.cleanup);
  const output = h.install({ WHOSE_TURN_PORT: '8801' });
  const plist = readFileSync(join(h.home, 'Library/LaunchAgents/local.whose-turn.plist'), 'utf8');
  assert.match(plist, /<key>WHOSE_TURN_PORT<\/key><string>8801<\/string><\/dict>/);
  assert.doesNotMatch(plist, /WHOSE_TURN_DATA/);
  assert.match(output, /WHOSE_TURN_PORT from this shell is written into it\./);
});

test('without either variable the Installed line and the unit stay as they were', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Linux');
  t.after(h.cleanup);
  const output = h.install();
  assert.doesNotMatch(readFileSync(join(h.home, '.config/systemd/user/whose-turn.service'), 'utf8'), /WHOSE_TURN_(DATA|PORT)/);
  assert.doesNotMatch(output, /written into it/);
});

const launch = (t, { shell, path, hint }) => {
  const h = harness('Linux');
  t.after(h.cleanup);
  writeFileSync(join(h.root, 'server.mjs'), '');
  const make = (dir, name) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), '#!/bin/sh\necho "ran $0"\n');
    chmodSync(join(dir, name), 0o755);
    return join(dir, name);
  };
  const env = { HOME: h.home, PATH: '/usr/bin:/bin' };
  const nodes = {};
  if (path) { nodes.path = make(join(h.home, 'on-path'), 'node'); env.PATH = `${join(h.home, 'on-path')}:${env.PATH}`; }
  if (hint) { nodes.hint = make(join(h.home, 'hint'), 'node'); env.WHOSE_TURN_NODE = nodes.hint; }
  if (shell) nodes.shell = make(join(h.home, 'nvm'), 'node');
  writeFileSync(join(h.home, 'sh'), `#!/bin/sh\n${shell ? `echo ${nodes.shell}` : 'exit 0'}\n`);
  chmodSync(join(h.home, 'sh'), 0o755);
  env.SHELL = join(h.home, 'sh');
  const run = () => execFileSync('/bin/bash', [join(h.root, 'launch.sh')], { env, encoding: 'utf8' });
  return { run, nodes, h };
};

test('launcher: the login shell node wins, then PATH, then the install-time hint', { skip: process.platform === 'win32' }, (t) => {
  const a = launch(t, { shell: true, path: true, hint: true });
  assert.equal(a.run().trim(), `ran ${a.nodes.shell}`);
  const b = launch(t, { path: true, hint: true });
  assert.equal(b.run().trim(), `ran ${b.nodes.path}`);
  const c = launch(t, { hint: true });
  assert.equal(c.run().trim(), `ran ${c.nodes.hint}`);
});

test('launcher: a hint pointing at a removed node is skipped, and no node at all exits with one line', { skip: process.platform === 'win32' }, (t) => {
  const a = launch(t, { path: true, hint: true });
  rmSync(a.nodes.hint);
  assert.equal(a.run().trim(), `ran ${a.nodes.path}`);
  const b = launch(t, {});
  assert.throws(() => b.run(), (error) => error.status === 1 && /no node found/.test(error.stdout));
});
