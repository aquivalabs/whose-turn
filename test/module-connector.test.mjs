import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as moduleConnector from '../connectors/module.mjs';
import { connectorCatalogue, secretsRequired } from '../connectors/index.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';

const run = promisify(execFile);
const fixture = (name) => fileURLToPath(new URL(`./fixtures/adapters/${name}.mjs`, import.meta.url));
const script = fileURLToPath(new URL('../scripts/check-adapter.mjs', import.meta.url));
const secrets = (token) => ({ get: async () => token });

const dataDirWithAdapters = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'whose-turn-module-'));
  mkdirSync(join(dataDir, 'adapters'));
  for (const name of ['board', 'broken', 'sloppy']) {
    copyFileSync(fixture(name), join(dataDir, 'adapters', `${name}.mjs`));
  }
  return dataDir;
};

const workspaceWith = (entry, token = 't') => createWorkspace(
  { id: 'w', name: 'Events', key_pattern: 'BRD-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'module', id: 'board', ...entry }] },
  { dataDir: dataDirWithAdapters(), historyDays: 3650, secrets: secrets(token), notify: () => {} },
);

test('a user adapter named in the adapters folder is loaded, checked and polled through the same path as the built-ins', async () => {
  const workspace = workspaceWith({ adapter: 'board', board: 'launch' });
  await workspace.poll();
  const snapshot = workspace.snapshot(true);
  assert.deepEqual(snapshot.errors, {});
  assert.deepEqual(snapshot.tickets.map((ticket) => [ticket.key, ticket.source]), [['BRD-1', 'board'], ['BRD-2', 'board']]);
  const next = Object.fromEntries(snapshot.turn.map((row) => [row.row_id, row.next]));
  assert.equal(next['BRD-1'], 'Continue the work');
  assert.equal(next['BRD-1:k1'], 'Answer Sam Lead in the ticket');
});

test('the token reaches the adapter only through secret(), filed under the adapter name; a missing one is the adapter\'s partial error', async () => {
  const workspace = workspaceWith({ adapter: 'board', board: 'launch' }, '');
  await workspace.poll();
  assert.deepEqual(workspace.snapshot(false).errors, { 'board.auth': 'no token' });
  const entry = { type: 'module', id: 'board', adapter: 'board' };
  assert.deepEqual(secretsRequired([entry], { ...entry, adapter: 'sloppy' }), ['token']);
});

test('a module that is not a connector, or a poll that breaks the shapes, is the entry\'s error with every problem named', async () => {
  const broken = workspaceWith({ adapter: 'broken' });
  await broken.poll();
  const [message] = Object.values(broken.snapshot(false).errors);
  assert.match(message, /^ContractError: Adapter .*broken\.mjs does not follow connector contract 1: export const contract = 1 is missing; id must be/);
  assert.match(message, /capability "emails" is unknown/);

  const sloppy = workspaceWith({ adapter: 'sloppy' });
  await sloppy.poll();
  assert.match(sloppy.snapshot(false).errors.board, /tickets\[0\]\.status_category is missing; tickets\[0\]\.url must be empty or start with https:\/\/; returns prs but does not declare it/);

  const missing = workspaceWith({ adapter: 'board' });
  await missing.poll();
  assert.equal(missing.snapshot(false).errors.board, 'Error: Adapter board needs board in the connector entry');
  await assert.rejects(moduleConnector.loadAdapter('/nowhere/adapter.mjs'), /No adapter file at \/nowhere\/adapter\.mjs/);
});

test('an adapter is named by its file name only, so no config can point outside the adapters folder', async () => {
  assert.equal(moduleConnector.adapterFile('/data/adapters', 'trello'), '/data/adapters/trello.mjs');
  for (const name of ['../evil', '/tmp/evil', '~/evil', 'Evil', '', undefined]) {
    assert.throws(() => moduleConnector.adapterFile('/data/adapters', name), /must be lowercase letters, digits/);
  }
  const outside = workspaceWith({ adapter: '../board' });
  await outside.poll();
  assert.match(outside.snapshot(false).errors.board, /Adapter name "\.\.\/board" must be/);
});

test('the experimental types are accepted in the config but not offered by the settings catalogue', () => {
  const types = connectorCatalogue().map((connector) => connector.type);
  assert.deepEqual(types, ['github', 'jira', 'linear']);
});

test('check-adapter passes a good adapter with its rows, and fails a bad one with exit 1 and each problem on a line', async () => {
  const good = await run(process.execPath, [script, fixture('board'), '--settings', '{"board":"launch"}'], { env: { ...process.env, WHOSE_TURN_ADAPTER_TOKEN: 't' } });
  assert.match(good.stdout, /^contract 1 · board \(Board\) · supplies tickets, comments\npoll ok · me "Alex Doe" · 2 tickets, 1 comments\ndefault rules make 3 rows:/);
  assert.match(good.stdout, /you {4}BRD-1 · Answer Sam Lead in the ticket/);
  const bad = await run(process.execPath, [script, fixture('broken')]).catch((error) => error);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /not an adapter: .*broken\.mjs\n {2}- export const contract = 1 is missing\n/);
  const usage = await run(process.execPath, [script]).catch((error) => error);
  assert.equal(usage.code, 2);
});
