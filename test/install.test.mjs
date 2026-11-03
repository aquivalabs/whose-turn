import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const harness = (kernel) => {
  const home = mkdtempSync(join(tmpdir(), 'wt-install-'));
  const bin = join(home, 'stub-bin');
  const log = join(home, 'calls.log');
  mkdirSync(bin);
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub('uname', `echo ${kernel}`);
  stub('node', 'exit 0');
  for (const name of ['systemctl', 'launchctl']) {
    stub(name, `echo "${name} $*" >> "${log}"`);
  }
  const install = () =>
    execFileSync('bash', [join(ROOT, 'install.sh')], { env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8' });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
  return { home, bin, install, calls, cleanup: () => rmSync(home, { recursive: true, force: true }) };
};

test('Linux: writes a systemd user unit with the node path found at install time and enables it', { skip: process.platform === 'win32' }, (t) => {
  const h = harness('Linux');
  t.after(h.cleanup);
  const output = h.install();
  const unit = readFileSync(join(h.home, '.config/systemd/user/whose-turn.service'), 'utf8');
  assert.match(unit, new RegExp(`^ExecStart="${h.bin}/node" "${ROOT}/server.mjs"$`, 'm'));
  assert.match(unit, new RegExp(`^WorkingDirectory=${ROOT}$`, 'm'));
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
  assert.match(plist, new RegExp(`<string>${h.bin}/node</string><string>${ROOT}/server.mjs</string>`));
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
