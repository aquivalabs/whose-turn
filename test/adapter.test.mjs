import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Adapter } from '../lib/adapter.mjs';
import { adapterProblems } from '../lib/contract.mjs';
import { CONNECTORS } from '../connectors/index.mjs';

test('every built-in source is an Adapter that follows the contract', () => {
  for (const type of ['github', 'jira', 'linear', 'file']) {
    assert.ok(CONNECTORS[type] instanceof Adapter, type);
    assert.deepEqual(adapterProblems(CONNECTORS[type]), [], type);
  }
});

test('an Adapter subclass that does not implement poll is refused, and its poll throws', async () => {
  class Lazy extends Adapter {
    contract = 1;
    id = 'lazy';
    label = 'Lazy';
    capabilities = ['tickets'];
  }
  const lazy = new Lazy();
  assert.deepEqual(adapterProblems(lazy), ['poll(context) must be implemented; the base Adapter only refuses']);
  await assert.rejects(lazy.poll({}), /Lazy does not implement poll\(context\)/);
  assert.deepEqual([lazy.links({}), lazy.fields, lazy.persistedCache, lazy.badge, lazy.tone], [[], [], [], '', 'jira']);
});
