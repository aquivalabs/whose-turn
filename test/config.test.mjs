import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolvePort, DEFAULT_RULES, WORKSPACE_FIELDS, GLOBAL_SETTINGS, defaultDataDir, settingsViolations, normaliseWorkspaces, entryShapeViolations } from '../lib/config.mjs';
import { homedir } from 'node:os';
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

const withPlatform = (platform, env, body) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  const saved = { APPDATA: process.env.APPDATA, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  Object.defineProperty(process, 'platform', { value: platform });
  for (const key of Object.keys(saved)) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    return body();
  } finally {
    Object.defineProperty(process, 'platform', original);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test('the data directory follows the platform: Application Support, APPDATA, XDG_CONFIG_HOME, then ~/.config', () => {
  // Setup
  const home = homedir();
  // Exercise
  const mac = withPlatform('darwin', { APPDATA: 'C:\\app', XDG_CONFIG_HOME: '/xdg' }, defaultDataDir);
  const windows = withPlatform('win32', { APPDATA: join(tmpdir(), 'roaming') }, defaultDataDir);
  const windowsBare = withPlatform('win32', {}, defaultDataDir);
  const linux = withPlatform('linux', { APPDATA: join(tmpdir(), 'roaming'), XDG_CONFIG_HOME: join(tmpdir(), 'xdg') }, defaultDataDir);
  const linuxBare = withPlatform('linux', {}, defaultDataDir);
  // Verify
  assert.equal(mac, join(home, 'Library', 'Application Support', 'whose-turn'));
  assert.equal(windows, join(tmpdir(), 'roaming', 'whose-turn'));
  assert.equal(windowsBare, join(home, 'whose-turn'));
  assert.equal(linux, join(tmpdir(), 'xdg', 'whose-turn'));
  assert.equal(linuxBare, join(home, '.config', 'whose-turn'));
});

test('the editable workspace fields keep their keys, flags and choices', () => {
  // Setup
  const shape = (fields) => fields.map((field) => [field.key, ...['required', 'list', 'colour', 'boolean', 'default'].filter((flag) => field[flag] !== undefined).map((flag) => `${flag}=${field[flag]}`)]);
  // Exercise
  const sections = Object.fromEntries(Object.entries(WORKSPACE_FIELDS).map(([name, fields]) => [name, shape(fields)]));
  // Verify
  assert.deepEqual(sections, {
    workspace: [['id', 'required=true'], ['name'], ['key_pattern'], ['links', 'list=true']],
    theme: [['seed', 'colour=true'], ['accent', 'colour=true'], ['backdrop', 'boolean=true', 'default=true']],
    rules: [['approved_next'], ['approved_release_next'], ['release_branch_prefix'], ['passed_next'], ['merged_next'], ['automation_authors', 'list=true'], ['backlog_rows']],
    statuses: ['code_review', 'qa', 'passed', 'release', 'on_hold', 'backlog'].map((key) => [key, 'list=true']),
  });
  assert.deepEqual(WORKSPACE_FIELDS.rules.at(-1).choices, ['hide', 'list']);
  for (const fields of Object.values(WORKSPACE_FIELDS)) {
    for (const field of fields) {
      assert.ok(field.label, field.key);
    }
  }
});

test('a monitor-wide number is accepted at its minimum and maximum and refused one step beyond', () => {
  // Setup
  const problem = (key, value) => settingsViolations({ [key]: value }).length;
  // Exercise
  const edges = Object.entries(GLOBAL_SETTINGS).map(([key, spec]) => [key, problem(key, spec.min), problem(key, spec.max), problem(key, spec.min - 1), problem(key, spec.max + 1)]);
  // Verify
  for (const edge of edges) {
    assert.deepEqual(edge.slice(1), [0, 0, 1, 1], edge[0]);
  }
  assert.equal(problem('poll_seconds', Number.NaN), 1);
  assert.equal(problem('poll_seconds', Infinity), 1);
  assert.equal(problem('poll_seconds', '60'), 1);
  assert.equal(problem('poll_seconds', 60.5), 0);
  assert.equal(problem('history_days', 2.5), 1);
});

test('a setting violation names the field and says what range is allowed', () => {
  // Setup
  const settings = { history_days: 2.5, nonsense: 1 };
  // Exercise
  const violations = settingsViolations(settings);
  // Verify
  assert.deepEqual(violations[0], { field: 'settings.history_days', description: 'history_days must be a whole number from 1 to 365.' });
  assert.equal(violations[1].field, 'settings.nonsense');
  assert.match(violations[1].description, /nonsense is not a setting; the settings are poll_seconds, history_days, stale_minutes, failing_polls\./);
  assert.deepEqual(settingsViolations('x'), [{ field: 'settings', description: 'settings must be an object.' }]);
});

test('a partial statuses override keeps the default groups it does not name', () => {
  // Setup
  const raw = { workspaces: [{ id: 'home', rules: { statuses: { qa: ['uat'] } } }] };
  // Exercise
  const [workspace] = withConfig(raw).workspaces;
  // Verify
  assert.deepEqual(workspace.rules.statuses.qa, ['uat']);
  assert.deepEqual(workspace.rules.statuses.backlog, DEFAULT_RULES.statuses.backlog);
  assert.deepEqual(workspace.rules.statuses.on_hold, DEFAULT_RULES.statuses.on_hold);
});

test('a flat config without github or jira has no connectors, and a hidden mode is carried through', () => {
  // Setup
  const result = normaliseWorkspaces([{ id: 'a', hidden: 'parked' }, { id: 'b' }]);
  // Exercise
  const [parked, shown] = result.workspaces;
  // Verify
  assert.equal(parked.hidden, 'parked');
  assert.equal('hidden' in shown, false);
  assert.deepEqual(withConfig({}).workspaces[0].connectors, []);
});

test('theme colours are lower-cased and a bad accent is reported while the seed stays', () => {
  // Setup
  const good = normaliseWorkspaces([{ id: 'a', theme: { seed: '#3D7A5C', accent: '#C27A2C' } }]);
  const bad = normaliseWorkspaces([{ id: 'a', theme: { seed: '#3D7A5C', accent: 'red' } }]);
  const noAccent = normaliseWorkspaces([{ id: 'a', theme: { seed: '#3d7a5c' } }]);
  const accentOnly = normaliseWorkspaces([{ id: 'a', theme: { accent: '#c27a2c' } }]);
  // Exercise
  const results = [good.workspaces[0].theme, bad.workspaces[0].theme, noAccent.workspaces[0].theme, accentOnly.workspaces[0].theme];
  // Verify
  assert.deepEqual(results[0], { seed: '#3d7a5c', accent: '#c27a2c' });
  assert.deepEqual(results[1], { seed: '#3d7a5c' });
  assert.deepEqual(results[2], { seed: '#3d7a5c' });
  assert.equal(results[3], null);
  assert.deepEqual(bad.problems, ['Workspace "a": theme.accent must be a hex colour like #c27a2c; the accent is ignored.']);
  assert.deepEqual(noAccent.problems, []);
  assert.deepEqual(good.problems, []);
  assert.deepEqual(accentOnly.problems, ['Workspace "a": theme.seed must be a hex colour like #3d7a5c; the theme is ignored.']);
});

test('quick links parse from strings and objects, keep only http and https, and fall back to the host as label', () => {
  // Setup
  const links = [
    '  Board   https://example.com/board  ',
    'http://plain.example.com/x',
    'Docs http://example.com/docs',
    'no link here',
    'ftp://example.com/x',
    { label: 'Obj', url: 'https://example.com/o' },
    { url: 'http://example.com/nolabel' },
    { label: 'Bad', url: 'ftp://example.com' },
    { label: 'Mid', url: 'xhttps://example.com' },
    null,
  ];
  // Exercise
  const [workspace] = normaliseWorkspaces([{ id: 'a', links }]).workspaces;
  // Verify
  assert.deepEqual(workspace.links, [
    { label: 'Board', url: 'https://example.com/board' },
    { label: 'plain.example.com/x', url: 'http://plain.example.com/x' },
    { label: 'Docs', url: 'http://example.com/docs' },
    { label: 'Obj', url: 'https://example.com/o' },
    { label: 'http://example.com/nolabel', url: 'http://example.com/nolabel' },
  ]);
});

test('field problems name the workspace and index for key pattern, hidden mode, backlog rows and statuses', () => {
  // Setup
  const raw = [{
    id: 'a',
    key_pattern: '(',
    hidden: 'gone',
    rules: { backlog_rows: 'all', automation_authors: ['ok', 3], question_words: 'x', statuses: { qa: ['fine', ' '], passed: 'no' } },
  }, { id: 'b', rules: { statuses: ['x'] } }, { id: 'c', rules: { statuses: null } }, { id: 'd', key_pattern: '\\bX-\\d+', hidden: 'paused', rules: { backlog_rows: 'list', statuses: { qa: ['x'] } } }];
  // Exercise
  const { violations } = normaliseWorkspaces(raw);
  // Verify
  const byField = (field) => violations.filter((entry) => entry.field === field);
  assert.match(byField('workspaces[0].key_pattern')[0].description, /^Workspace "a": key_pattern is not a valid regular expression: /);
  assert.equal(byField('workspaces[0].hidden')[0].description, 'Workspace "a": hidden must be one of parked, paused, or left out.');
  assert.equal(byField('workspaces[0].rules.backlog_rows')[0].description, 'Workspace "a": rules.backlog_rows must be one of hide, list.');
  const messages = violations.map((entry) => entry.description);
  assert.ok(messages.includes('Workspace "a": rules.automation_authors must be a list of strings.'));
  assert.ok(messages.includes('Workspace "a": rules.question_words must be a list of strings.'));
  assert.ok(messages.includes('Workspace "a": rules.statuses.qa must be a list of non-empty strings.'));
  assert.ok(messages.includes('Workspace "a": rules.statuses.passed must be a list of non-empty strings.'));
  assert.ok(messages.includes('Workspace "b": rules.statuses must be an object of lists.'));
  assert.ok(messages.includes('Workspace "c": rules.statuses must be an object of lists.'));
  assert.equal(violations.filter((entry) => /Workspace "d"/.test(entry.description)).length, 0);
});

test('a statuses list is refused when it mixes strings with other values, and an empty list is fine', () => {
  // Setup
  const raw = [{ id: 'a', rules: { statuses: { qa: ['ok', 5], passed: [] } } }];
  // Exercise
  const { problems } = normaliseWorkspaces(raw);
  // Verify
  assert.deepEqual(problems, ['Workspace "a": rules.statuses.qa must be a list of non-empty strings.']);
  assert.deepEqual(normaliseWorkspaces([{ id: 'a', rules: { automation_authors: ['x', 1] } }]).problems, ['Workspace "a": rules.automation_authors must be a list of strings.']);
});

test('connector fields are checked for boolean and choice values by their field key and position', () => {
  // Setup
  const raw = [{ id: 'a', connectors: [{ type: 'github', repo: 'acme/app', workflow_runs: 'yes' }, { type: 'github', id: 'second', repo: 'acme/app', workflow_runs: false }, { type: 'unknown', repo: 'x' }] }];
  // Exercise
  const { violations } = normaliseWorkspaces(raw);
  // Verify
  assert.deepEqual(violations, [{ field: 'workspaces[0].connectors[0].workflow_runs', description: 'Workspace "a": connector "github": workflow_runs must be true or false.' }]);
});

test('workspace ids are checked: missing ids get a position, bad ids are named, and names fall back to the id then the position', () => {
  // Setup
  const raw = [{}, { id: null, name: 'Named' }, { id: 'Bad Id' }, { id: '' }, { id: 7 }, { id: 'ok', name: '' }, { id: 'x'.repeat(40) }, { id: 'x'.repeat(41) }];
  // Exercise
  const { workspaces, violations } = normaliseWorkspaces(raw);
  // Verify
  assert.deepEqual(workspaces.map((workspace) => workspace.id), ['ws1', 'ws2', 'Bad Id', '', '7', 'ok', 'x'.repeat(40), 'x'.repeat(41)]);
  assert.deepEqual(workspaces.map((workspace) => workspace.name), ['Workspace 1', 'Named', 'Bad Id', 'Workspace 4', '7', 'ok', 'x'.repeat(40), 'x'.repeat(41)]);
  assert.deepEqual(violations.map((entry) => [entry.field, entry.description]), [
    ['workspaces[2].id', 'Workspace 3: the id "Bad Id" must be 1 to 40 lowercase letters, digits or hyphens, starting with a letter or digit.'],
    ['workspaces[3].id', 'Workspace 4: the id is required.'],
    ['workspaces[4].id', 'Workspace 5: the id "7" must be 1 to 40 lowercase letters, digits or hyphens, starting with a letter or digit.'],
    ['workspaces[7].id', `Workspace 8: the id "${'x'.repeat(41)}" must be 1 to 40 lowercase letters, digits or hyphens, starting with a letter or digit.`],
  ]);
});

test('workspaces without a theme seed get distinct derived seeds, and a seeded one gets none', () => {
  // Setup
  const raw = [{ id: 'one' }, { id: 'two' }, { id: 'three', theme: { seed: '#3d7a5c' } }];
  // Exercise
  const { workspaces } = normaliseWorkspaces(raw);
  // Verify
  assert.match(workspaces[0].derived_seed, /^#[0-9a-f]{6}$/);
  assert.match(workspaces[1].derived_seed, /^#[0-9a-f]{6}$/);
  assert.notEqual(workspaces[0].derived_seed, workspaces[1].derived_seed);
  assert.equal('derived_seed' in workspaces[2], false);
});

test('parking every workspace is a problem, parking some is not', () => {
  // Setup
  const all = normaliseWorkspaces([{ id: 'a', hidden: 'parked' }, { id: 'b', hidden: 'paused' }]);
  const some = normaliseWorkspaces([{ id: 'a', hidden: 'parked' }, { id: 'b' }]);
  const none = normaliseWorkspaces([]);
  // Exercise
  const messages = [all.problems, some.problems, none.problems];
  // Verify
  assert.deepEqual(messages[0], ['Keep at least one workspace in the rail: parked and paused workspaces are out of it.']);
  assert.deepEqual(messages[1], []);
  assert.deepEqual(messages[2], []);
});

test('a duplicate workspace id and a duplicate connector id are each reported once', () => {
  // Setup
  const raw = [{ id: 'a', connectors: [{ type: 'github', repo: 'acme/app' }, { type: 'github', repo: 'acme/other' }] }, { id: 'a' }];
  // Exercise
  const { problems } = normaliseWorkspaces(raw);
  // Verify
  assert.deepEqual(problems, ['Workspace "a" has two connectors with the same id; give each an "id".', 'Two workspaces share the id "a".']);
});

test('entries that are not objects are reported with their position', () => {
  // Setup
  const raw = [{ id: 'a', connectors: [{ type: 'github' }, 'x', null] }, 'text', { id: 'b', connectors: 'nope' }];
  // Exercise
  const violations = entryShapeViolations(raw);
  // Verify
  assert.deepEqual(violations, [
    { field: 'workspaces[0].connectors[1]', description: 'Every connector must be an object.' },
    { field: 'workspaces[0].connectors[2]', description: 'Every connector must be an object.' },
    { field: 'workspaces[1]', description: 'Every workspace must be an object.' },
  ]);
  assert.deepEqual(entryShapeViolations('x'), []);
});

test('a notifications block without a boolean desktop keeps desktop on and says so; false turns it off', () => {
  // Setup
  const untouched = withConfig({ workspaces: [] });
  const off = withConfig({ workspaces: [], notifications: { desktop: false } });
  const bad = withConfig({ workspaces: [], notifications: { desktop: 'no' } });
  // Exercise
  const results = [untouched.notifications, off.notifications, bad.notifications];
  // Verify
  assert.deepEqual(results, [{ desktop: true }, { desktop: false }, { desktop: true }]);
  assert.ok(bad.problems.includes('notifications.desktop must be true or false; desktop notifications stay on.'));
  assert.equal(untouched.problems.some((line) => line.startsWith('notifications')), false);
  assert.equal(off.problems.some((line) => line.startsWith('notifications')), false);
});

test('settings outside their range fall back to the default and report it, valid ones are kept', () => {
  // Setup
  const config = withConfig({ workspaces: [], poll_seconds: 5, history_days: 30, failing_polls: 2.5 });
  // Exercise
  const { pollSeconds, historyDays, health, problems } = config;
  // Verify
  assert.equal(pollSeconds, 60);
  assert.equal(historyDays, 30);
  assert.equal(health.failing_polls, GLOBAL_SETTINGS.failing_polls.fallback);
  assert.ok(problems.includes('poll_seconds must be a number from 15 to 3600; using 60.'));
  assert.ok(problems.includes(`failing_polls must be a whole number from 1 to 100; using ${GLOBAL_SETTINGS.failing_polls.fallback}.`));
  assert.equal(problems.some((line) => line.startsWith('history_days')), false);
});

test('an object-shaped connectors map becomes a list, and non-objects in a list are dropped', () => {
  // Setup
  const raw = [{ id: 'a', connectors: { github: { repo: 'acme/app' }, jira: null } }, { id: 'b', connectors: [{ type: 'github', repo: 'x' }, 'junk', null, 4] }];
  // Exercise
  const { workspaces } = normaliseWorkspaces(raw);
  // Verify
  assert.deepEqual(workspaces[0].connectors.map((entry) => entry.id), ['github', 'jira']);
  assert.deepEqual(workspaces[1].connectors.map((entry) => entry.id), ['github']);
});
