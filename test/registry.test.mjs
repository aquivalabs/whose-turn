import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../lib/registry.mjs';

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
