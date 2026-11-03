import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as file from '../connectors/file.mjs';
import { adapterProblems, resultProblems } from '../lib/contract.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { makeKeyFinder } from '../lib/text.mjs';

const keyOf = makeKeyFinder('\\bPROJ-\\d+\\b');
const scratch = () => mkdtempSync(join(tmpdir(), 'whose-turn-file-'));
const written = (name, text) => {
  const path = join(scratch(), name);
  writeFileSync(path, text);
  return path;
};

const PLAN = `# Launch
- [ ] Book the room
## In Progress
- [ ] PROJ-7 Write the README
- [ ] Review the copy @sam
## Backlog
- [ ] Translate the site
- [x] Order the badges
`;

test('the file connector is itself a contract 1 connector, and its result passes the contract check', async () => {
  assert.deepEqual(adapterProblems(file), []);
  const result = await file.poll({ settings: { path: written('plan.md', PLAN) }, cache: {}, keyOf });
  assert.deepEqual(resultProblems(result, file.capabilities), []);
});

test('a Markdown task list becomes tickets: the heading is the status, [x] is done, @name assigns, a key in the text is kept', async () => {
  const result = await file.poll({ settings: { path: written('plan.md', PLAN), me: 'alex' }, cache: {}, keyOf });
  assert.equal(result.me, 'alex');
  assert.deepEqual(result.tickets.map((ticket) => [ticket.summary, ticket.status, ticket.status_category, ticket.assignee]), [
    ['Book the room', 'To Do', 'new', 'alex'],
    ['PROJ-7 Write the README', 'In Progress', 'indeterminate', 'alex'],
    ['Review the copy', 'In Progress', 'indeterminate', 'sam'],
    ['Translate the site', 'Backlog', 'new', 'alex'],
    ['Order the badges', 'Done', 'done', 'alex'],
  ]);
  assert.equal(result.tickets[1].key, 'PROJ-7');
  assert.match(result.tickets[0].key, /^F-[0-9a-f]{6}$/);
});

test('a JSON file is a list of tickets; a non-https url is dropped and a shape without a list is refused', async () => {
  const tickets = [{ key: 'T-1', title: 'Renew the domain', status: 'Doing', updated: '2026-11-01T09:00:00Z', url: 'http://insecure.example/T-1' }, { summary: 'Pay the invoice', done: true }];
  const result = await file.poll({ settings: { path: written('tasks.json', JSON.stringify({ tickets })) }, cache: {}, keyOf });
  assert.deepEqual(result.tickets.map((ticket) => [ticket.key, ticket.status, ticket.status_category, ticket.updated, ticket.url]), [
    ['T-1', 'Doing', 'indeterminate', '2026-11-01T09:00:00Z', ''],
    [result.tickets[1].key, 'Done', 'done', result.tickets[1].updated, ''],
  ]);
  await assert.rejects(file.poll({ settings: { path: written('bad.json', '{"items": []}') }, cache: {}, keyOf }), /must be a list/);
  await assert.rejects(file.poll({ settings: { path: join(scratch(), 'missing.md') }, cache: {}, keyOf }), /Cannot read .*no such file/);
});

test('saving the file moves only the item that changed', async () => {
  const path = written('plan.md', '- [ ] One\n- [ ] Two\n');
  const cache = {};
  utimesSync(path, new Date('2026-11-01T08:00:00Z'), new Date('2026-11-01T08:00:00Z'));
  const first = await file.poll({ settings: { path }, cache, keyOf });
  writeFileSync(path, '- [ ] One\n## In Progress\n- [ ] Two\n');
  utimesSync(path, new Date('2026-11-02T08:00:00Z'), new Date('2026-11-02T08:00:00Z'));
  const second = await file.poll({ settings: { path }, cache, keyOf });
  assert.deepEqual(first.tickets.map((ticket) => ticket.updated), ['2026-11-01T08:00:00Z', '2026-11-01T08:00:00Z']);
  assert.deepEqual(second.tickets.map((ticket) => ticket.updated), ['2026-11-01T08:00:00Z', '2026-11-02T08:00:00Z']);
});

test('a ticket from a file gets a row like any other, through the workspace poll and the default rules', async () => {
  const path = written('plan.md', PLAN);
  const workspace = createWorkspace(
    { id: 'w', name: 'Home', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'file', id: 'plan', path, me: 'alex' }] },
    { dataDir: scratch(), historyDays: 14, notify: () => {} },
  );
  await workspace.poll();
  const snapshot = workspace.snapshot(false);
  assert.deepEqual(snapshot.errors, {});
  const next = Object.fromEntries(snapshot.turn.map((row) => [row.summary, [row.group, row.next, row.source]]));
  assert.deepEqual(next['PROJ-7 Write the README'], ['you', 'Continue the work', 'plan']);
  assert.deepEqual(next['Book the room'], ['you', 'Pick it up', 'plan']);
  assert.equal(next['Review the copy'][0], 'others');
  assert.equal(next['Translate the site'][0], 'gone');
  assert.equal(next['Order the badges'][0], 'done');
});
