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
  assert.deepEqual([lazy.links({}), lazy.fields, lazy.persistedCache, lazy.badge, lazy.tone, lazy.experimental, lazy.reportable], [[], [], [], '', '', false, true]);
});

test('labels on a ticket or a PR are optional, and when present must be a list of strings (RMA-434)', async () => {
  const { resultProblems } = await import('../lib/contract.mjs');
  const ticket = { key: 'B-1', summary: 's', status: 'Open', status_category: 'new', assignee: 'a', updated: '2026-11-09T09:00:00Z', url: 'https://b.example/1' };
  assert.deepEqual(resultProblems({ tickets: [ticket, { ...ticket, labels: ['bug'] }] }, ['tickets']), []);
  assert.deepEqual(resultProblems({ tickets: [{ ...ticket, labels: ['bug', 3] }] }, ['tickets']), ['tickets[0].labels must be a list of strings']);
  assert.deepEqual(resultProblems({ tickets: [{ ...ticket, labels: 'bug' }] }, ['tickets']), ['tickets[0].labels must be array, got string']);
});
