import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSecrets } from '../lib/secrets.mjs';

const recorder = (reply) => {
  const calls = [];
  const run = async (...call) => {
    calls.push(call);
    return reply(...call);
  };
  return { calls, run };
};

const scratch = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-secrets-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

const refuse = async () => {
  throw new Error('tool missing');
};

test('macOS: Keychain through security', async (t) => {
  const { calls, run } = recorder(() => 'token-1\n');
  const secrets = createSecrets(scratch(t), { platform: 'darwin', run });
  assert.equal(await secrets.get('svc', 'me'), 'token-1');
  await secrets.set('svc', 'me', 'v');
  assert.deepEqual(calls, [
    ['security', ['find-generic-password', '-s', 'svc', '-a', 'me', '-w']],
    ['security', ['-i'], 'add-generic-password -U -a "me" -s "svc" -w "v"\n'],
  ]);
});

test('macOS: the value goes to security on stdin, quoted, and never into argv', async (t) => {
  const { calls, run } = recorder(() => '');
  const secrets = createSecrets(scratch(t), { platform: 'darwin', run });
  await secrets.set('svc', 'me', 'pa"ss\\word');
  const [file, args, input] = calls[0];
  assert.equal(file, 'security');
  assert.deepEqual(args, ['-i']);
  assert.ok(!args.join(' ').includes('pa'));
  assert.equal(input, 'add-generic-password -U -a "me" -s "svc" -w "pa\\"ss\\\\word"\n');
});

test('Linux: libsecret through secret-tool, the value on stdin and never in argv', async (t) => {
  const { calls, run } = recorder(() => 'token-2\n');
  const secrets = createSecrets(scratch(t), { platform: 'linux', run });
  assert.equal(await secrets.get('svc', 'me'), 'token-2');
  await secrets.set('svc', 'me', 'hunter2');
  assert.deepEqual(calls[0], ['secret-tool', ['lookup', 'service', 'svc', 'account', 'me']]);
  assert.deepEqual(calls[1], ['secret-tool', ['store', '--label=whose-turn svc', 'service', 'svc', 'account', 'me'], 'hunter2']);
  assert.ok(!calls[1][1].includes('hunter2'));
});

test('Windows: the PowerShell credential script with the value on stdin', async (t) => {
  const { calls, run } = recorder(() => 'token-3');
  const secrets = createSecrets(scratch(t), { platform: 'win32', run });
  assert.equal(await secrets.get('svc', 'me'), 'token-3');
  await secrets.set('svc', 'me', 'hunter2');
  for (const [file, args] of calls) {
    assert.equal(file, 'powershell');
    assert.deepEqual(args.slice(0, 5), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']);
    assert.match(args[5], /platform[\\/]credential\.ps1$/);
    assert.ok(!args.includes('hunter2'));
  }
  assert.deepEqual(calls[0][1].slice(6), ['get', 'svc', 'me']);
  assert.deepEqual(calls[1][1].slice(6), ['set', 'svc', 'me']);
  assert.equal(calls[1][2], 'hunter2');
});

test('a refusing tool falls back to a 600-mode file that get reads back', async (t) => {
  const dir = scratch(t);
  for (const platform of ['darwin', 'linux', 'win32']) {
    const secrets = createSecrets(dir, { platform, run: refuse });
    assert.equal(await secrets.get('svc', `me-${platform}`), '');
    await secrets.set('svc', `me-${platform}`, 'from-file');
    assert.equal(await secrets.get('svc', `me-${platform}`), 'from-file');
    assert.equal(readFileSync(join(dir, 'secrets', `svc@me-${platform}`), 'utf8'), 'from-file');
    assert.equal(statSync(join(dir, 'secrets', `svc@me-${platform}`)).mode & 0o777, 0o600);
  }
});

test('a platform without a store uses the file and runs nothing; a store that holds nothing falls through to the file', async (t) => {
  const dir = scratch(t);
  const none = recorder(() => '');
  const bsd = createSecrets(dir, { platform: 'freebsd', run: none.run });
  await bsd.set('svc', 'me', 'v');
  assert.equal(await bsd.get('svc', 'me'), 'v');
  assert.deepEqual(none.calls, []);
  const linux = createSecrets(dir, { platform: 'linux', run: none.run });
  assert.equal(await linux.get('svc', 'me'), 'v');
});
