import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../lib/store.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'wt-cache-'));
const cachePath = (dir) => join(dir, 'workspaces', 'w', 'cache.json');
const data = { prs: new Map([[7, { updated_at: 'u1', row: { pr: 7, state: 'OPEN' }, sha: 'abc', activity: [{ at: 'a' }] }]]), asks: new Map([['n1', { updated_at: 'u2', row: null }]]) };
const secret = { token: 'ghp_secret', tokenAt: 1, me: 'alex', last: { prs: [] } };

test('the cache round-trips as Maps, and nothing outside the allowlist reaches the file', () => {
  const dir = scratch();
  openStore(dir, 'w').saveCaches({ github: { ...data, ...secret } }, { github: ['prs', 'asks'] });
  const text = readFileSync(cachePath(dir), 'utf8');
  assert.ok(!/token|ghp_secret|"me"|"last"/.test(text));
  const restored = openStore(dir, 'w').loadCache('github');
  assert.deepEqual(Object.keys(restored).sort(), ['asks', 'prs']);
  assert.ok(restored.prs instanceof Map && restored.asks instanceof Map);
  assert.deepEqual(restored.prs.get(7), data.prs.get(7));
  assert.deepEqual(openStore(dir, 'w').loadCache('other'), {});
});

test('a file with another version is ignored', () => {
  const dir = scratch();
  const store = openStore(dir, 'w');
  store.saveCaches({ github: data }, { github: ['prs'] });
  const saved = JSON.parse(readFileSync(cachePath(dir), 'utf8'));
  writeFileSync(cachePath(dir), JSON.stringify({ ...saved, version: 99 }));
  assert.deepEqual(openStore(dir, 'w').loadCache('github'), {});
});

test('a corrupt file is ignored and the next save overwrites it', () => {
  const dir = scratch();
  const store = openStore(dir, 'w');
  writeFileSync(cachePath(dir), '{not json');
  assert.deepEqual(openStore(dir, 'w').loadCache('github'), {});
  store.saveCaches({ github: data }, { github: ['prs'] });
  assert.equal(openStore(dir, 'w').loadCache('github').prs.size, 1);
});

const pull = (number) => ({ number, title: `PROJ-${number} change`, state: 'open', merged_at: null, updated_at: `t${number}`, html_url: `https://github.com/o/r/pull/${number}`, base: { ref: 'main' }, head: { sha: `sha${number}` } });

const stubHttp = (calls, numbers) => ({
  fetchJson: async (url) => {
    const path = url.replace('https://api.github.com', '');
    calls.push(path);
    if (path.startsWith('/search/issues')) {
      return { items: path.includes('is%3Aopen') ? numbers.map((number) => ({ number, updated_at: `t${number}` })) : [] };
    }
    if (path === '/user') {
      return { login: 'alex' };
    }
    if (path.startsWith('/notifications')) {
      return [];
    }
    if (/\/pulls\/\d+$/.test(path)) {
      return pull(Number(path.split('/').pop()));
    }
    if (path.includes('/check-runs')) {
      return { check_runs: [{ status: 'completed', conclusion: 'success' }] };
    }
    return [];
  },
});

const withFakeGh = async (run) => {
  const bin = scratch();
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho tok\n');
  chmodSync(join(bin, 'gh'), 0o755);
  const before = process.env.PATH;
  process.env.PATH = `${bin}:${before}`;
  try {
    return await run();
  } finally {
    process.env.PATH = before;
  }
};

const definition = { id: 'w', name: 'W', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'github', id: 'github', repo: 'o/r' }] };

const startAndPoll = async (dir, numbers) => {
  const calls = [];
  const workspace = createWorkspace(definition, { dataDir: dir, historyDays: 14, http: stubHttp(calls, numbers), secrets: { get: async () => '' }, notify: () => {} });
  await workspace.poll();
  return calls;
};

test('a restart with the file re-fetches nothing but the searches and the checks of open PRs', async () => {
  await withFakeGh(async () => {
    const numbers = [1, 2, 3];
    const coldDir = scratch();
    const cold = await startAndPoll(coldDir, numbers);
    const warm = await startAndPoll(coldDir, numbers);
    const withoutFile = await startAndPoll(scratch(), numbers);
    const searches = (calls) => calls.filter((path) => path.startsWith('/search/issues')).length;
    const details = (calls) => calls.filter((path) => /\/pulls\/\d+$/.test(path)).length;
    assert.equal(searches(warm), 2);
    assert.equal(details(warm), 0);
    assert.equal(warm.length, 2 + 1 + 1 + 2 + numbers.length, 'two searches, /user, notifications, the repository and its workflow runs, one checks refresh per open PR');
    assert.equal(details(withoutFile), 3);
    assert.ok(withoutFile.length > warm.length && cold.length === withoutFile.length);
  });
});

test('a poll that fails to reach any connector leaves the file untouched', async () => {
  await withFakeGh(async () => {
    const dir = scratch();
    await startAndPoll(dir, [1]);
    const before = readFileSync(cachePath(dir), 'utf8');
    const workspace = createWorkspace(definition, { dataDir: dir, historyDays: 14, http: { fetchJson: async () => { throw new Error('offline'); } }, secrets: { get: async () => '' }, notify: () => {} });
    await workspace.poll();
    assert.equal(readFileSync(cachePath(dir), 'utf8'), before);
  });
});
