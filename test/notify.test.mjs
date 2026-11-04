import { test } from 'node:test';
import assert from 'node:assert/strict';
import { muted, notifier, notify } from '../lib/notify.mjs';

const capture = (platform, title, body) => {
  const calls = [];
  notify(title, body, { platform, run: (...call) => calls.push(call) });
  return calls;
};

test('macOS: the text travels as argv after a fixed script', () => {
  const [[file, args]] = capture('darwin', 'PR ready', 'Review it');
  assert.equal(file, 'osascript');
  assert.deepEqual(args.slice(-2), ['PR ready', 'Review it']);
  assert.ok(args.filter((arg) => arg === '-e').length === 3);
});

test('macOS: quotes, backslashes and newlines never reach the script text', () => {
  const nasty = 'a"b\\\nc" & (do shell script "id") & "';
  const [[, args]] = capture('darwin', nasty, nasty);
  const script = args.slice(0, -2).join('\n');
  assert.ok(!script.includes('do shell script'));
  assert.deepEqual(args.slice(-2), [nasty, nasty]);
});

test('Linux: notify-send with title and body', () => {
  assert.deepEqual(capture('linux', 'T', 'B'), [['notify-send', ['T', 'B']]]);
});

test('Windows: PowerShell reads title and body from the environment, not the script', () => {
  const nasty = '"; Remove-Item x; "';
  const [[file, args, env]] = capture('win32', nasty, 'B');
  assert.equal(file, 'powershell');
  assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.ok(!args[3].includes('Remove-Item'));
  assert.deepEqual(env, { WHOSE_TURN_TITLE: nasty, WHOSE_TURN_BODY: 'B' });
});

test('title and body are cut to a sane length; other platforms stay silent', () => {
  const [[, args]] = capture('linux', 'x'.repeat(500), 'y'.repeat(500));
  assert.deepEqual(args.map((text) => text.length), [120, 240]);
  assert.deepEqual(capture('freebsd', 'T', 'B'), []);
});

test('tests and scratch servers stay silent: a test runner or WHOSE_TURN_NOTIFY=off mutes the real notification', () => {
  assert.equal(muted({ NODE_TEST_CONTEXT: 'child-v8' }), true);
  assert.equal(muted({ VITEST: 'true' }), true);
  assert.equal(muted({ WHOSE_TURN_NOTIFY: 'off' }), true);
  assert.equal(muted({}), false);
  assert.equal(muted({ WHOSE_TURN_NOTIFY: 'on' }), false);
});

test('this very test run is muted, so the suite never reaches the desktop', () => {
  assert.equal(muted(), true);
});

test('the notifications.desktop setting stops notify from firing, and turning it on again fires', () => {
  const calls = [];
  let desktop = false;
  const send = () => notify('T', 'B', { platform: 'linux', run: (...call) => calls.push(call), enabled: desktop });
  send();
  assert.deepEqual(calls, []);
  desktop = true;
  send();
  assert.equal(calls.length, 1);
});

test('notifier reads the setting at each call, so a flip between two calls applies to the second', () => {
  let desktop = true;
  const reads = [];
  const calls = [];
  const send = notifier(() => { reads.push(desktop); return desktop; }, { platform: 'linux', run: (...call) => calls.push(call) });
  send('T', 'B');
  desktop = false;
  send('T', 'B');
  assert.deepEqual(reads, [true, false]);
  assert.deepEqual(calls, [['notify-send', ['T', 'B']]]);
});
