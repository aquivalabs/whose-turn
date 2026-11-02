import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, DEFAULT_RULES } from '../lib/config.mjs';

const withConfig = (value) => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  if (value !== null) {
    writeFileSync(join(dir, 'config.json'), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return loadConfig({ WHOSE_TURN_DATA: dir });
};

test('a missing config is reported as a problem, not a crash', () => {
  const config = withConfig(null);
  assert.equal(config.workspaces.length, 1);
  assert.deepEqual(config.workspaces[0].connectors, []);
  assert.match(config.problems[0], /No workspace config/);
});

test('a flat config with github and jira at the top becomes one default workspace', () => {
  const config = withConfig({ github: { repo: 'your-org/your-repo' }, jira: { base: 'https://your-site.atlassian.net', email: 'you@example.com', key_pattern: '\\bPROJ-\\d+\\b' }, rules: { approved_next: 'Ship it' } });
  const [workspace] = config.workspaces;
  assert.equal(workspace.id, 'default');
  assert.deepEqual(workspace.connectors.map((entry) => [entry.type, entry.id]), [['github', 'github'], ['jira', 'jira']]);
  assert.equal(workspace.rules.approved_next, 'Ship it');
  assert.deepEqual(workspace.rules.statuses, DEFAULT_RULES.statuses);
  assert.equal(workspace.key_pattern, '\\bPROJ-\\d+\\b');
});

test('the example config loads with three workspaces and placeholder accounts only', () => {
  const config = loadConfig({ WHOSE_TURN_DATA: tmpdir(), WHOSE_TURN_CONFIG: new URL('../config.example.json', import.meta.url).pathname });
  assert.deepEqual(config.workspaces.map((workspace) => workspace.id), ['work', 'personal', 'demo']);
  assert.equal(config.workspaces[0].connectors[0].repo, 'your-org/your-repo');
  assert.equal(config.workspaces[0].connectors[1].email, 'you@example.com');
  assert.equal(config.problems.length, 0);
});

test('duplicate workspace ids and a broken file are problems', () => {
  assert.match(withConfig({ workspaces: [{ id: 'a' }, { id: 'a' }] }).problems[0], /share the id/);
  assert.match(withConfig('{ not json').problems[0], /Cannot parse/);
});

test('a connector list may hold two entries of one type when each has its own id', () => {
  const config = withConfig({ workspaces: [{ id: 'w', connectors: [{ type: 'github', id: 'app', repo: 'you/app' }, { type: 'github', id: 'site', repo: 'you/site' }] }] });
  assert.deepEqual(config.workspaces[0].connectors.map((entry) => entry.id), ['app', 'site']);
  assert.equal(config.problems.length, 0);
  assert.match(withConfig({ workspaces: [{ id: 'w', connectors: [{ type: 'github', repo: 'a/b' }, { type: 'github', repo: 'c/d' }] }] }).problems[0], /same id/);
});

test('the port comes from the environment before the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ port: 9000 }));
  assert.equal(loadConfig({ WHOSE_TURN_DATA: dir, WHOSE_TURN_PORT: '9001' }).port, 9001);
});
