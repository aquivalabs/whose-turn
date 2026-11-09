import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSource } from './fixtures/fake-source.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as moduleConnector from '../connectors/module.mjs';
import { CONNECTORS, connectorCatalogue, secretsRequired } from '../connectors/index.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { Adapter } from '../lib/adapter.mjs';

const run = promisify(execFile);
const fixture = (name) => fileURLToPath(new URL(`./fixtures/adapters/${name}.mjs`, import.meta.url));
const script = fileURLToPath(new URL('../scripts/check-adapter.mjs', import.meta.url));
const secrets = (token) => ({ get: async () => token });

const dataDirWithAdapters = async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'whose-turn-module-'));
  await moduleConnector.writeAdapterShim(moduleConnector.adaptersDirOf(dataDir));
  for (const name of ['board', 'broken', 'sloppy', 'plain']) {
    copyFileSync(fixture(name), join(dataDir, 'adapters', `${name}.mjs`));
  }
  return dataDir;
};

const workspaceWith = async (entry, token = 't') => createWorkspace(
  { id: 'w', name: 'Events', key_pattern: 'BRD-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'module', id: 'board', ...entry }] },
  { dataDir: await dataDirWithAdapters(), historyDays: 3650, secrets: secrets(token), notify: () => {} },
);

test('a user adapter named in the adapters folder is loaded, checked and polled through the same path as the built-ins', async () => {
  const workspace = await workspaceWith({ adapter: 'board', board: 'launch' });
  await workspace.poll();
  const snapshot = workspace.snapshot(true);
  assert.deepEqual(snapshot.errors, {});
  assert.deepEqual(snapshot.tickets.map((ticket) => [ticket.key, ticket.source]), [['BRD-1', 'board'], ['BRD-2', 'board']]);
  const next = Object.fromEntries(snapshot.turn.map((row) => [row.row_id, row.next]));
  assert.equal(next['BRD-1'], 'Continue the work');
  assert.equal(next['BRD-1:k1'], 'Answer Sam Lead in the ticket');
});

test('a mark names a row by its row_id, or by a key only one row carries', async () => {
  const workspace = await workspaceWith({ adapter: 'board', board: 'launch' });
  await workspace.poll();
  const turn = workspace.snapshot(true).turn;
  const comment = turn.find((row) => row.row_id === 'BRD-1:k1');
  assert.equal(workspace.rowIdOf('BRD-1'), 'BRD-1');
  assert.equal(workspace.rowIdOf('BRD-1:k1'), 'BRD-1:k1');
  assert.equal(comment.key, 'BRD-1');
  assert.equal(workspace.rowIdOf('BRD-404'), null);
});

test('a key carried by one run row resolves to that row, and a key two rows share resolves to none', async () => {
  const run = (ref, streak) => ({ id: `${ref}-${streak}`, ref, streak, workflow: 'ci', branch: 'main', failed: 1, mine: 1, actor: 'alex', title: '', url: `https://ci.example/${ref}/${streak}`, at: '2026-11-07T10:00:00Z' });
  CONNECTORS.runs_only = fakeSource({ id: 'runs_only', poll: async () => ({ me: 'alex', runs: [run('acme/app:ci@main', 3), run('acme/web:ci@main', 1), run('acme/web:ci@main', 2)] }) });
  try {
    const workspace = createWorkspace(
      { id: 'w', name: 'Runs', key_pattern: 'BRD-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'runs_only', id: 'ci' }] },
      { dataDir: await dataDirWithAdapters(), historyDays: 3650, secrets: secrets('t'), notify: () => {} },
    );
    await workspace.poll();
    const runRows = workspace.snapshot(true).turn.filter((row) => row.row_id.startsWith('run:'));
    assert.equal(runRows.length, 3);
    assert.equal(workspace.rowIdOf('acme/app:ci@main'), 'run:ci:acme/app:ci@main:3');
    assert.equal(workspace.rowIdOf('acme/web:ci@main'), null);
  } finally {
    delete CONNECTORS.runs_only;
  }
});

test('the token reaches the adapter only through secret(), filed under the adapter name, so another name never reaches it; a missing one is the adapter\'s partial error', async () => {
  const workspace = await workspaceWith({ adapter: 'board', board: 'launch' }, '');
  await workspace.poll();
  assert.deepEqual(workspace.snapshot(false).errors, { 'board.auth': 'no token' });
  const entry = { type: 'module', id: 'board', adapter: 'board' };
  assert.deepEqual(secretsRequired([entry], { ...entry, adapter: 'sloppy' }), []);
});

test('a module that is not a connector, or a poll that breaks the shapes, is the entry\'s error with every problem named', async () => {
  const broken = await workspaceWith({ adapter: 'broken' });
  await broken.poll();
  const [message] = Object.values(broken.snapshot(false).errors);
  assert.match(message, /^ContractError: Adapter .*broken\.mjs does not follow connector contract 1: contract = 1 is missing; id must be/);
  assert.match(message, /capability "emails" is unknown/);

  const sloppy = await workspaceWith({ adapter: 'sloppy' });
  await sloppy.poll();
  assert.match(sloppy.snapshot(false).errors.board, /tickets\[0\]\.status_category is missing; tickets\[0\]\.url must be empty or start with https:\/\/; returns prs but does not declare it/);

  const missing = await workspaceWith({ adapter: 'board' });
  await missing.poll();
  assert.equal(missing.snapshot(false).errors.board, 'Error: Adapter board needs board in the connector entry');
  await assert.rejects(moduleConnector.loadAdapter('/nowhere/adapter.mjs'), /No adapter file at \/nowhere\/adapter\.mjs/);
});

test('an adapter is named by its file name only, so no config can point outside the adapters folder', async () => {
  assert.equal(moduleConnector.adapterFile('/data/adapters', 'trello'), '/data/adapters/trello.mjs');
  for (const name of ['../evil', '/tmp/evil', '~/evil', 'Evil', '', undefined]) {
    assert.throws(() => moduleConnector.adapterFile('/data/adapters', name), /must be lowercase letters, digits/);
  }
  const outside = await workspaceWith({ adapter: '../board' });
  await outside.poll();
  assert.match(outside.snapshot(false).errors.board, /Adapter name "\.\.\/board" must be/);
});

test('a built-in whose poll breaks the contract gets a partial error naming the problems, its data still flows, and it never counts as a failing poll (RMA-435)', async () => {
  CONNECTORS.broken_builtin = fakeSource({ contract: 1, id: 'broken_builtin', label: 'Broken', capabilities: ['tickets'], fields: [], poll: async () => ({ me: 'me', tickets: [{ key: 'BRD-1' }], prs: [] }) });
  try {
    const workspace = createWorkspace(
      { id: 'w', name: 'Events', key_pattern: 'BRD-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'broken_builtin', id: 'bad' }] },
      { dataDir: await dataDirWithAdapters(), historyDays: 3650, secrets: secrets('t'), notify: () => {} },
    );
    await workspace.poll();
    const snapshot = workspace.snapshot(true);
    assert.match(snapshot.errors['bad.contract'], /^Broken does not follow connector contract 1: .*returns prs but does not declare it/);
    assert.deepEqual(snapshot.tickets.map((ticket) => ticket.key), ['BRD-1']);
    await workspace.poll();
    assert.deepEqual(workspace.store.state.fails, {});
    assert.deepEqual(workspace.snapshot(false).health.failing, []);
  } finally {
    delete CONNECTORS.broken_builtin;
  }
});

test('a module in the old shape of plain exports is refused, so every user adapter extends Adapter', async () => {
  const plain = await workspaceWith({ adapter: 'plain' });
  await plain.poll();
  assert.match(plain.snapshot(false).errors.board, /its default export must be a subclass of Adapter, imported from '\.\/_whose-turn\.mjs'/);
});

test('the shim re-exports this server\'s Adapter and is rewritten only when it differs', async () => {
  const adaptersDir = moduleConnector.adaptersDirOf(mkdtempSync(join(tmpdir(), 'whose-turn-shim-')));
  const file = await moduleConnector.writeAdapterShim(adaptersDir);
  const { mtimeMs } = statSync(file);
  await moduleConnector.writeAdapterShim(adaptersDir);
  assert.equal(statSync(file).mtimeMs, mtimeMs);
  const { Adapter: shimmed } = await import(pathToFileURL(file).href);
  assert.equal(shimmed, Adapter);
});

test('saving a config checks every module entry: a missing or broken adapter is a violation at its adapter field', async () => {
  const dataDir = await dataDirWithAdapters();
  const workspaces = [{ id: 'w', connectors: [{ type: 'github', id: 'gh' }, { type: 'module', id: 'ok', adapter: 'board' }, { type: 'module', id: 'bad', adapter: 'broken' }, { type: 'module', id: 'gone', adapter: 'nowhere' }] }];
  const violations = await moduleConnector.adapterViolations(workspaces, dataDir);
  assert.deepEqual(violations.map((violation) => violation.field), ['workspaces[0].connectors[2].adapter', 'workspaces[0].connectors[3].adapter']);
  assert.match(violations[0].description, /^Workspace "w", connector "bad": broken\.mjs does not follow the source contract: /);
  assert.equal(violations[1].description, 'Workspace "w", connector "gone": nowhere.mjs is not in the adapters folder yet');
  assert.ok(violations.every((violation) => !violation.description.includes(dataDir)));
});

test('an adapter that cannot be loaded is a violation naming the file and the first line of the error, without the folder', async () => {
  const dataDir = await dataDirWithAdapters();
  writeFileSync(join(dataDir, 'adapters', 'typo.mjs'), 'export default {\n');
  const workspaces = [{ id: 'w', connectors: [{ type: 'module', id: 'typo', adapter: 'typo' }] }];
  const [violation] = await moduleConnector.adapterViolations(workspaces, dataDir);
  assert.match(violation.description, /^Workspace "w", connector "typo": typo\.mjs cannot be loaded: \S/);
  assert.ok(!violation.description.includes(dataDir));
  assert.ok(!violation.description.includes('\n'));
});

test('a custom source\'s file name is made from its label: Latin, lowercase, words joined by _, at most 40 characters', () => {
  const cases = [['Team Board 2', 'team_board_2'], ['\u041c\u043e\u044f \u0434\u043e\u0441\u043a\u0430 Trello', 'moya_doska_trello'], ['  Notion: work!! ', 'notion_work'], ['Caf\u00e9 cr\u00e8me', 'cafe_creme'], ['', ''], ['x'.repeat(60), 'x'.repeat(40)]];
  assert.deepEqual(cases.map(([label]) => moduleConnector.adapterNameOf(label)), cases.map(([, name]) => name));
});

test('the adapter catalogue loads only the adapters the config names, with their label and fields or the problem of a broken one', async () => {
  const workspaces = [{ id: 'w', connectors: [{ type: 'module', id: 'a', adapter: 'board' }, { type: 'module', id: 'b', adapter: 'broken' }, { type: 'github', id: 'gh' }] }];
  const catalogue = await moduleConnector.adapterCatalogue(await dataDirWithAdapters(), workspaces);
  assert.deepEqual(Object.keys(catalogue).sort(), ['board', 'broken']);
  assert.deepEqual(catalogue.board, { label: 'Board', fields: [{ key: 'board', label: 'Board', required: true }] });
  assert.match(catalogue.broken.problem, /^broken\.mjs does not follow the source contract: /);
  assert.ok(!catalogue.broken.problem.includes('/'));
});

test('the settings catalogue offers the built-ins and Custom, and leaves out the experimental file type', () => {
  const types = connectorCatalogue().map((connector) => connector.type);
  assert.deepEqual(types, ['github', 'jira', 'linear', 'module']);
});

test('check-adapter passes a good adapter with its rows, and fails a bad one with exit 1 and each problem on a line', async () => {
  const good = await run(process.execPath, [script, fixture('board'), '--settings', '{"board":"launch"}'], { env: { ...process.env, WHOSE_TURN_ADAPTER_TOKEN: 't' } });
  assert.match(good.stdout, /^contract 1 · board \(Board\) · supplies tickets, comments\npoll ok · me "Alex Doe" · 2 tickets, 1 comments\ndefault rules make 3 rows:/);
  assert.match(good.stdout, /you {4}BRD-1 · Answer Sam Lead in the ticket/);
  const bad = await run(process.execPath, [script, fixture('broken')]).catch((error) => error);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /not an adapter: .*broken\.mjs\n {2}- contract = 1 is missing\n/);
  const usage = await run(process.execPath, [script]).catch((error) => error);
  assert.equal(usage.code, 2);
});
