import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_RULES, loadConfig, saveWorkspaces, normaliseWorkspaces } from '../lib/config.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { createRegistry } from '../lib/registry.mjs';
import { isDue, PARKED_EVERY_MS } from '../lib/backoff.mjs';
import { CONNECTORS } from '../connectors/index.mjs';

const ME = 'Alex Doe';
const script = { tickets: [], polls: 0 };

CONNECTORS.parkable = {
  id: 'parkable',
  label: 'Parkable',
  fields: [],
  poll: async () => {
    script.polls += 1;
    return { tickets: structuredClone(script.tickets), prs: [], comments: [], activity: [], asks: [], runs: [], me: ME };
  },
};

const ticket = (key, assignee = ME) => ({
  key, summary: `Fix ${key}`, status: 'In Progress', status_category: 'indeterminate', assignee,
  updated: new Date().toISOString(), url: `https://tracker.example/browse/${key}`, status_change: null,
});

const open = async (hidden, tickets = [ticket('PROJ-1')]) => {
  script.tickets = tickets;
  script.polls = 0;
  const unparked = [];
  const notes = [];
  const workspace = createWorkspace(
    { id: 'quiet', name: 'Quiet', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ id: 'parkable', type: 'parkable' }], ...(hidden ? { hidden } : {}) },
    { dataDir: mkdtempSync(join(tmpdir(), 'whose-turn-')), historyDays: 14, http: {}, notify: (title) => notes.push(title), unpark: async (id) => { unparked.push(id); } },
  );
  await workspace.poll();
  return { workspace, unparked, notes };
};

test('hidden is validated: only parked or paused, and not every workspace at once', () => {
  const bad = normaliseWorkspaces([{ id: 'a', hidden: true }, { id: 'b' }]);
  assert.deepEqual(bad.violations.map((entry) => entry.field), ['workspaces[0].hidden']);
  const all = normaliseWorkspaces([{ id: 'a', hidden: 'parked' }, { id: 'b', hidden: 'paused' }]);
  assert.match(all.problems.join(' '), /at least one workspace in the rail/);
  const fine = normaliseWorkspaces([{ id: 'a', hidden: 'parked' }, { id: 'b' }]);
  assert.deepEqual(fine.violations, []);
  assert.deepEqual(fine.workspaces.map((workspace) => workspace.hidden), ['parked', undefined]);
});

test('hidden survives a save and a load of the config file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const file = join(dir, 'config.json');
  saveWorkspaces(file, [{ id: 'a', hidden: 'paused' }, { id: 'b' }]);
  assert.equal(loadConfig({ WHOSE_TURN_DATA: dir }).workspaces[0].hidden, 'paused');
});

test('the schedule: shown every round, parked every 15 minutes and at once after a start, paused never', () => {
  const now = 10 * PARKED_EVERY_MS;
  assert.equal(isDue('', now - 1000, now), true);
  assert.equal(isDue('parked', 0, now), true);
  assert.equal(isDue('parked', now - PARKED_EVERY_MS + 1000, now), false);
  assert.equal(isDue('parked', now - PARKED_EVERY_MS, now), true);
  assert.equal(isDue('paused', 0, now), false);
});

test('a parked workspace is polled once at the start, then not again within 15 minutes', async () => {
  const { workspace } = await open('parked');
  const before = script.polls;
  await workspace.pollIfDue();
  assert.equal(script.polls, before);
});

test('a paused workspace makes no request at all', async () => {
  script.polls = 0;
  const workspace = createWorkspace(
    { id: 'still', name: 'Still', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ id: 'parkable', type: 'parkable' }], hidden: 'paused' },
    { dataDir: mkdtempSync(join(tmpdir(), 'whose-turn-')), historyDays: 14, http: {}, notify: () => {} },
  );
  await workspace.pollIfDue();
  assert.equal(script.polls, 0);
  assert.equal(workspace.summary().hidden, 'paused');
});

test('a parked check that finds a new Your move row unparks the workspace, says why in the feed and notifies', async () => {
  const { workspace, unparked, notes } = await open('parked');
  script.tickets = [ticket('PROJ-1'), ticket('PROJ-2')];
  await workspace.poll();
  assert.deepEqual(unparked, ['quiet']);
  assert.equal(workspace.hidden, '');
  const line = workspace.snapshot(false).feed.find((item) => item.kind === 'returned');
  assert.equal(line.key, 'PROJ-2');
  assert.match(line.text, /Back in the rail/);
  assert.equal(workspace.describe().returned, true);
  assert.equal(notes.length, 1);
});

test('a parked check with nothing new stays parked', async () => {
  const { workspace, unparked } = await open('parked');
  script.tickets = [ticket('PROJ-1'), ticket('PROJ-2', 'Sam Tester')];
  await workspace.poll();
  assert.deepEqual(unparked, []);
  assert.equal(workspace.hidden, 'parked');
});

test('a paused workspace never comes back by itself, even when polled by hand', async () => {
  const { workspace, unparked } = await open('paused');
  script.tickets = [ticket('PROJ-1'), ticket('PROJ-2')];
  await workspace.poll();
  assert.deepEqual(unparked, []);
  assert.equal(workspace.hidden, 'paused');
});

test('the registry unparks through the config and keeps the workspace object', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ workspaces: [{ id: 'a', hidden: 'parked' }, { id: 'b' }] }));
  const registry = createRegistry({
    load: () => loadConfig({ WHOSE_TURN_DATA: dir }),
    save: (raw) => saveWorkspaces(file, raw),
    build: (definition) => ({ id: definition.id, subscribe: () => {} }),
  });
  const [parked] = registry.workspaces;
  assert.equal(parked.hidden, 'parked');
  await registry.setHidden('a', '');
  assert.equal(registry.workspaces[0], parked);
  assert.equal(parked.hidden, '');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).workspaces[0].hidden, undefined);
  await registry.setHidden('a', 'paused');
  assert.equal(parked.hidden, 'paused');
});
