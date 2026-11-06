import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../lib/registry.mjs';
import { loadConfig, saveNotifications, saveWorkspaces } from '../lib/config.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const fakeWorkspace = (definition) => {
  const listeners = [];
  return { id: definition.id, polls: 0, subscribe: (listener) => { listeners.push(listener); return () => {}; }, emit: (event) => listeners.forEach((listener) => listener(event)) };
};

const harness = () => {
  let definitions = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const built = [];
  const registry = createRegistry({
    load: () => ({ workspaces: definitions, rawWorkspaces: definitions, problems: [], configFile: 'x.json' }),
    save: (raw) => { definitions = raw; },
    build: (definition) => { const workspace = fakeWorkspace(definition); built.push(workspace); return workspace; },
  });
  return { registry, built, setDefinitions: (next) => { definitions = next; } };
};

test('a save keeps the workspaces whose definition did not change and builds only the new or changed ones', async () => {
  const { registry, built } = harness();
  const [a, b] = registry.workspaces;
  const created = await registry.save([{ id: 'a', name: 'A' }, { id: 'b', name: 'B renamed' }, { id: 'c', name: 'C' }]);
  assert.equal(registry.workspaces[0], a);
  assert.notEqual(registry.workspaces[1], b);
  assert.deepEqual(created.map((workspace) => workspace.id), ['b', 'c']);
  assert.equal(built.length, 4);
});

test('events of every workspace, including ones built on reload, reach the registry subscribers', async () => {
  const { registry } = harness();
  const seen = [];
  registry.subscribe((event) => seen.push(event.ws));
  registry.workspaces[0].emit({ ws: 'a' });
  await registry.save([{ id: 'a', name: 'A' }, { id: 'z', name: 'Z' }]);
  registry.workspaces[1].emit({ ws: 'z' });
  assert.deepEqual(seen, ['a', 'z']);
  assert.deepEqual(registry.workspaces.map((workspace) => workspace.id), ['a', 'z']);
});

test('a save that only reorders keeps every workspace object and follows the new order', async () => {
  const { registry, built } = harness();
  const [a, b] = registry.workspaces;
  const created = await registry.save([{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }]);
  assert.deepEqual(created, []);
  assert.deepEqual(registry.workspaces, [b, a]);
  assert.equal(built.length, 2);
});

test('a build failure on save writes nothing and answers INVALID_CONFIG with the exception message', async () => {
  let written = 0;
  const registry = createRegistry({
    load: () => ({ workspaces: [{ id: 'a' }], rawWorkspaces: [{ id: 'a' }], problems: [], configFile: 'x.json' }),
    save: () => { written += 1; },
    build: (definition) => {
      if (definition.bad) {
        throw new SyntaxError('Invalid regular expression: /(/');
      }
      return fakeWorkspace(definition);
    },
  });
  await assert.rejects(registry.save([{ id: 'a' }, { id: 'b', bad: true }]), (error) => error.reason === 'INVALID_CONFIG' && /Invalid regular expression/.test(error.violations[0]));
  assert.equal(written, 0);
  assert.deepEqual(registry.workspaces.map((workspace) => workspace.id), ['a']);
});

test('a workspace whose build throws at load is dropped with a problem line and the rest start', () => {
  const registry = createRegistry({
    load: () => ({ workspaces: [{ id: 'a' }, { id: 'b' }], rawWorkspaces: [], problems: [], configFile: 'x.json' }),
    save: () => {},
    build: (definition) => {
      if (definition.id === 'b') {
        throw new SyntaxError('Invalid regular expression: /(/');
      }
      return fakeWorkspace(definition);
    },
  });
  assert.deepEqual(registry.workspaces.map((workspace) => workspace.id), ['a']);
  assert.match(registry.problems[0], /Workspace "b" was dropped: Invalid regular expression/);
});

test('the real notifications save reloads the registry, so a toggle applies live without a restart', async () => {
  const dir = scratchDir('wt-registry-');
  const env = { WHOSE_TURN_DATA: dir };
  const configFile = loadConfig(env).configFile;
  const registry = createRegistry({
    load: () => loadConfig(env),
    save: (raw) => saveWorkspaces(configFile, raw),
    saveNotifications: (notifications) => saveNotifications(configFile, notifications),
    build: (definition) => fakeWorkspace(definition),
  });
  assert.equal(registry.notifications.desktop, true);
  await registry.saveNotifications({ desktop: false });
  assert.equal(registry.notifications.desktop, false);
  await registry.saveNotifications({ desktop: true });
  assert.equal(registry.notifications.desktop, true);
});
