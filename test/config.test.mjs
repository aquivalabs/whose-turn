import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolvePort, DEFAULT_RULES } from '../lib/config.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const withConfig = (value) => {
  const dir = scratchDir('whose-turn-');
  if (value !== null) {
    writeFileSync(join(dir, 'config.json'), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return loadConfig({ WHOSE_TURN_DATA: dir });
};

test('a missing config is reported as a problem, not a crash', () => {
  const config = withConfig(null);
  assert.equal(config.workspaces.length, 1);
  assert.deepEqual(config.workspaces[0].connectors, []);
  assert.match(config.problems[0], /No workspace config yet: add a source in the workspace settings/);
  assert.ok(config.problems[0].includes(config.configFile));
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

test('the example config loads with two workspaces and placeholder accounts only', () => {
  const config = loadConfig({ WHOSE_TURN_DATA: tmpdir(), WHOSE_TURN_CONFIG: new URL('../config.example.json', import.meta.url).pathname });
  assert.deepEqual(config.workspaces.map((workspace) => workspace.id), ['work', 'personal']);
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
  const dir = scratchDir('whose-turn-');
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ port: 9000 }));
  assert.equal(loadConfig({ WHOSE_TURN_DATA: dir, WHOSE_TURN_PORT: '9001' }).port, 9001);
});

test('quick links accept "Label https://…" strings and {label, url} objects, and drop anything that is not an http link', () => {
  const config = withConfig({ workspaces: [{ id: 'w', links: ['Docs https://docs.example', { label: 'Board', url: 'https://board.example' }, 'nope', { url: 'ftp://x' }] }] });
  assert.deepEqual(config.workspaces[0].links, [{ label: 'Docs', url: 'https://docs.example' }, { label: 'Board', url: 'https://board.example' }]);
});

test('a workspace id must be lowercase letters, digits and hyphens; only a missing id gets ws<n>', () => {
  const ids = (list) => withConfig({ workspaces: list.map((id) => ({ ...(id === undefined ? {} : { id }), connectors: [] })) });
  const valid = ids(['a', 'ok-1', '0x', 'a'.repeat(40)]);
  assert.deepEqual(valid.problems, []);
  assert.equal(valid.workspaces.length, 4);
  for (const bad of ['../../escape', 'my space', 'Upper', '-lead', '', 'a'.repeat(41), 'a/b']) {
    const config = ids([bad]);
    assert.equal(config.problems.length, 1, JSON.stringify(bad));
    assert.match(config.problems[0], /id/);
    assert.equal(config.workspaces.length, 0, JSON.stringify(bad));
  }
  const missing = ids([undefined, 'b']);
  assert.deepEqual(missing.problems, []);
  assert.equal(missing.workspaces[0].id, 'ws1');
});

const configDir = (config) => {
  const dir = scratchDir('whose-turn-');
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  return dir;
};

test('resolvePort takes the env first, then the config file, then 8765', () => {
  const dir = configDir({ port: 8828 });
  assert.equal(resolvePort(dir, { WHOSE_TURN_PORT: '8830' }), 8830);
  assert.equal(resolvePort(dir, {}), 8828);
  assert.equal(resolvePort(configDir({}), {}), 8765);
  assert.equal(resolvePort(join(dir, 'missing'), {}), 8765);
});

const problemsOf = (workspace) => withConfig({ workspaces: [{ id: 'w', ...workspace }] }).problems;

test('a key_pattern that does not compile is a problem with the RegExp message', () => {
  assert.match(problemsOf({ key_pattern: '(' })[0], /key_pattern is not a valid regular expression: Invalid regular expression/);
  assert.deepEqual(problemsOf({ key_pattern: '\\bPROJ-\\d+\\b' }), []);
});

test('rules.statuses groups must be lists of non-empty strings', () => {
  assert.match(problemsOf({ rules: { statuses: { qa: 'ready' } } })[0], /rules\.statuses\.qa must be a list/);
  assert.match(problemsOf({ rules: { statuses: { qa: ['ok', ' '] } } })[0], /rules\.statuses\.qa/);
  assert.match(problemsOf({ rules: { statuses: ['qa'] } })[0], /rules\.statuses must be an object/);
});

test('automation_authors must be a list of strings', () => {
  assert.match(problemsOf({ rules: { automation_authors: 'bot' } })[0], /rules\.automation_authors must be a list of strings/);
  assert.match(problemsOf({ rules: { automation_authors: [1] } })[0], /rules\.automation_authors/);
});

test('question_words must be a list of strings', () => {
  assert.match(problemsOf({ rules: { question_words: { a: 1 } } })[0], /rules\.question_words must be a list of strings/);
});

test('desktop notifications are on unless notifications.desktop is false', () => {
  assert.deepEqual(withConfig({ workspaces: [] }).notifications, { desktop: true });
  assert.deepEqual(withConfig({ notifications: { desktop: false } }).notifications, { desktop: false });
  assert.deepEqual(withConfig({ notifications: { desktop: true } }).notifications, { desktop: true });
});

test('a notifications block of the wrong shape is reported and notifications stay on', () => {
  for (const notifications of [{ desktop: 'no' }, 'off', [false]]) {
    const config = withConfig({ notifications });
    assert.deepEqual(config.notifications, { desktop: true });
    assert.ok(config.problems.some((problem) => problem.startsWith('notifications.desktop must be true or false')));
  }
});
