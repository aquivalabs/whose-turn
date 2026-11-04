import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_RULES, loadConfig, saveWorkspaces, normaliseWorkspaces } from '../lib/config.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { createRegistry } from '../lib/registry.mjs';
import { isDue, PARKED_EVERY_MS } from '../lib/backoff.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
import { startTestApi } from './fixtures/api.mjs';

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
  const mode = { hidden: hidden || '' };
  const workspace = createWorkspace(
    { id: 'quiet', name: 'Quiet', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ id: 'parkable', type: 'parkable' }], ...(hidden ? { hidden } : {}) },
    { dataDir: mkdtempSync(join(tmpdir(), 'whose-turn-')), historyDays: 14, http: {}, notify: (title) => notes.push(title), hidden: () => mode.hidden, unpark: async (id) => { unparked.push(id); mode.hidden = ''; } },
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

test('the schedule: shown every round, parked every 15 minutes after its last check (at once with none), paused never', () => {
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

test('a parked workspace is due 15 minutes after its stored check, and at once without one or with an older one', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const definition = { id: 'quiet', name: 'Quiet', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ id: 'parkable', type: 'parkable' }], hidden: 'parked' };
  const rig = () => createWorkspace(definition, { dataDir, historyDays: 14, http: {}, notify: () => {} });
  const stored = (minutesAgo) => writeFileSync(join(dataDir, 'workspaces', 'quiet', 'state.json'), JSON.stringify({ polled_at: new Date(Date.now() - minutesAgo * 60000).toISOString() }));
  mkdirSync(join(dataDir, 'workspaces', 'quiet'), { recursive: true });
  const dueAfterRestart = async (minutesAgo) => {
    if (minutesAgo !== null) {
      stored(minutesAgo);
    }
    script.polls = 0;
    await rig().pollIfDue();
    return script.polls > 0;
  };
  assert.equal(await dueAfterRestart(null), true, 'no stored check: at once');
  assert.equal(await dueAfterRestart(5), false, 'checked five minutes ago: not yet');
  assert.equal(await dueAfterRestart(16), true, 'checked sixteen minutes ago: at once');
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
  assert.equal(registry.hiddenOf('a'), 'parked');
  const created = await registry.setHidden('a', '');
  assert.equal(registry.workspaces[0], parked);
  assert.deepEqual(created, [parked], 'a workspace that comes back is handed out to be polled');
  assert.equal(registry.hiddenOf('a'), '');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).workspaces[0].hidden, undefined);
  await registry.setHidden('a', 'paused');
  assert.equal(registry.hiddenOf('a'), 'paused');
});

const hiddenApi = async (initial) => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ workspaces: initial }));
  const registry = createRegistry({
    load: () => loadConfig({ WHOSE_TURN_DATA: dir }),
    save: (raw) => saveWorkspaces(file, raw),
    build: (definition) => ({ id: definition.id, subscribe: () => {}, pollIfDue: async () => {}, describe: () => ({ id: definition.id, hidden: registry.hiddenOf(definition.id) }) }),
    normalise: (raw) => normaliseWorkspaces(raw).workspaces,
  });
  const api = await startTestApi({ registry, reports: {} });
  return { ...api, registry, file };
};

test('POST /api/workspaces/hidden parks, pauses and restores one workspace and answers the list', async () => {
  const { server, post, registry, file } = await hiddenApi([{ id: 'a' }, { id: 'b' }]);
  try {
    const parked = await post('/api/workspaces/hidden', { id: 'a', hidden: 'parked' });
    assert.deepEqual((await parked.json()).workspaces, [{ id: 'a', hidden: 'parked' }, { id: 'b', hidden: '' }]);
    assert.equal(registry.hiddenOf('a'), 'parked');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).workspaces[0].hidden, 'parked');
    await post('/api/workspaces/hidden', { id: 'a', hidden: 'paused' });
    assert.equal(registry.hiddenOf('a'), 'paused');
    const shown = await post('/api/workspaces/hidden', { id: 'a', hidden: null });
    assert.equal(shown.status, 200);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).workspaces[0].hidden, undefined);
  } finally {
    server.close();
  }
});

test('POST /api/workspaces/hidden refuses a bad mode, an unknown workspace and hiding every workspace, and stores nothing', async () => {
  const { server, post, registry } = await hiddenApi([{ id: 'a', hidden: 'parked' }, { id: 'b' }]);
  try {
    const bad = await post('/api/workspaces/hidden', { id: 'b', hidden: 'gone' });
    assert.equal(bad.status, 400);
    const missing = await post('/api/workspaces/hidden', { id: 'b' });
    assert.equal(missing.status, 400);
    const unknown = await post('/api/workspaces/hidden', { id: 'zzz', hidden: 'parked' });
    assert.equal(unknown.status, 404);
    const every = await post('/api/workspaces/hidden', { id: 'b', hidden: 'paused' });
    assert.equal(every.status, 400);
    assert.equal((await every.json()).error.details[0].reason, 'INVALID_CONFIG');
    assert.equal(registry.hiddenOf('b'), '');
    assert.equal(registry.hiddenOf('a'), 'parked');
  } finally {
    server.close();
  }
});
