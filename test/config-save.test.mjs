import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveWorkspaces, saveNotifications, saveSettings, settingsViolations, normaliseWorkspaces } from '../lib/config.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

test('saving the workspace list keeps the other top-level keys and drops the flat legacy keys', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ port: 9100, github: { repo: 'you/old' }, rules: { approved_next: 'Old' } }));
  saveWorkspaces(file, [{ id: 'home', name: 'Home', connectors: [{ type: 'github', repo: 'you/app' }] }]);
  const written = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(written.port, 9100);
  assert.equal(written.github, undefined);
  assert.deepEqual(written.workspaces.map((workspace) => workspace.id), ['home']);
  const reloaded = loadConfig({ WHOSE_TURN_DATA: dir });
  assert.deepEqual(reloaded.rawWorkspaces, written.workspaces);
  assert.equal(reloaded.workspaces[0].connectors[0].repo, 'you/app');
});

test('saving into a missing file creates it', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'nested', 'config.json');
  saveWorkspaces(file, [{ id: 'home' }]);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { workspaces: [{ id: 'home' }] });
  assert.equal(existsSync(`${file}.bak`), false);
});

test('saving keeps the previous file as config.json.bak', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'config.json');
  const before = JSON.stringify({ port: 9100, workspaces: [{ id: 'old' }] });
  writeFileSync(file, before);
  saveWorkspaces(file, [{ id: 'new' }]);
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), before);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).workspaces[0].id, 'new');
});

test('validation reports duplicate ids and a bad theme without writing anything', () => {
  const { problems } = normaliseWorkspaces([{ id: 'a', theme: { seed: 'blue' } }, { id: 'a' }]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /theme.seed/);
  assert.match(problems[1], /share the id/);
});

test('the retired feedback tracker keys are dropped on load and on save, the composer stays', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'config.json');
  const composer = { command: 'codex', args: ['exec'] };
  writeFileSync(file, JSON.stringify({ workspaces: [{ id: 'home' }], feedback: { workspace: 'x', team: 'T', project: 'p', token_service: 's', assign: false, composer } }));
  assert.deepEqual(loadConfig({ WHOSE_TURN_CONFIG: file, WHOSE_TURN_DATA: dir }).feedback, { composer });
  saveWorkspaces(file, [{ id: 'home' }]);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).feedback, { composer });
  writeFileSync(file, JSON.stringify({ workspaces: [], feedback: { workspace: 'x', team: 'T' } }));
  saveWorkspaces(file, [{ id: 'home' }]);
  assert.equal('feedback' in JSON.parse(readFileSync(file, 'utf8')), false);
  assert.deepEqual(loadConfig({ WHOSE_TURN_CONFIG: file, WHOSE_TURN_DATA: dir }).feedback, {});
});

test('an unknown feedback key survives load and save', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ workspaces: [{ id: 'home' }], feedback: { team: 'T', future_key: 1 } }));
  assert.deepEqual(loadConfig({ WHOSE_TURN_CONFIG: file, WHOSE_TURN_DATA: dir }).feedback, { future_key: 1 });
  saveWorkspaces(file, [{ id: 'home' }]);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).feedback, { future_key: 1 });
});

test('saveNotifications writes the setting and keeps the other keys; loadConfig reads it back', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'config.json');
  saveWorkspaces(file, [{ id: 'w' }]);
  saveNotifications(file, { desktop: false });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { workspaces: [{ id: 'w' }], notifications: { desktop: false } });
  assert.deepEqual(loadConfig({ WHOSE_TURN_DATA: dir }).notifications, { desktop: false });
  saveWorkspaces(file, [{ id: 'w' }]);
  assert.deepEqual(loadConfig({ WHOSE_TURN_DATA: dir }).notifications, { desktop: false });
});

test('saveNotifications starts from an empty config when the file is missing or unparseable', () => {
  const dir = scratchDir('whose-turn-');
  const missing = join(dir, 'missing', 'config.json');
  saveNotifications(missing, { desktop: true });
  assert.deepEqual(JSON.parse(readFileSync(missing, 'utf8')), { notifications: { desktop: true } });
  const broken = join(dir, 'config.json');
  writeFileSync(broken, '{ not json');
  saveNotifications(broken, { desktop: false });
  assert.deepEqual(JSON.parse(readFileSync(broken, 'utf8')), { notifications: { desktop: false } });
  assert.equal(readFileSync(`${broken}.bak`, 'utf8'), '{ not json');
});

test('a workspace theme with only backdrop false is valid and keeps the seed derived', () => {
  const { problems, workspaces } = normaliseWorkspaces([{ id: 'a', theme: { backdrop: false } }, { id: 'b', theme: { seed: '#3d7a5c' } }, { id: 'c', theme: { seed: '#3D7A5C', backdrop: false } }]);
  assert.deepEqual(problems, []);
  assert.deepEqual(workspaces.map((workspace) => workspace.theme), [{ backdrop: false }, { seed: '#3d7a5c' }, { seed: '#3d7a5c', backdrop: false }]);
});

test('theme.backdrop that is not a boolean is reported and the backdrop stays on', () => {
  const { problems, workspaces } = normaliseWorkspaces([{ id: 'a', theme: { backdrop: 'no' } }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /theme.backdrop must be true or false/);
  assert.equal(workspaces[0].theme, null);
});

test('saving settings writes the four global keys and keeps everything else', () => {
  const dir = scratchDir('whose-turn-');
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ port: 9100, workspaces: [{ id: 'home' }] }));
  saveSettings(file, { poll_seconds: 30, history_days: 7, stale_minutes: 20, failing_polls: 5 });
  const written = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(written, { port: 9100, workspaces: [{ id: 'home' }], poll_seconds: 30, history_days: 7, stale_minutes: 20, failing_polls: 5 });
  const loaded = loadConfig({ WHOSE_TURN_DATA: dir });
  assert.deepEqual(loaded.settings, { poll_seconds: 30, history_days: 7, stale_minutes: 20, failing_polls: 5 });
  assert.equal(loaded.pollSeconds, 30);
  assert.equal(loaded.historyDays, 7);
});

test('loading a config without the global keys reports their defaults', () => {
  const dir = scratchDir('whose-turn-');
  assert.deepEqual(loadConfig({ WHOSE_TURN_DATA: dir }).settings, { poll_seconds: 60, history_days: 14, stale_minutes: 15, failing_polls: 3 });
});

test('settings violations name each bad key and refuse unknown ones', () => {
  assert.deepEqual(settingsViolations({ poll_seconds: 30, failing_polls: 4 }), []);
  const found = settingsViolations({ poll_seconds: 0, history_days: 1.5, stale_minutes: 'x', port: 1 });
  assert.deepEqual(found.map((entry) => entry.field), ['settings.poll_seconds', 'settings.history_days', 'settings.stale_minutes', 'settings.port']);
  assert.equal(settingsViolations('x')[0].field, 'settings');
});

test('a hand-edited file with settings out of range falls back to the defaults and reports each one', () => {
  const dir = scratchDir('whose-turn-');
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ workspaces: [{ id: 'home' }], poll_seconds: 5, history_days: 1.5, stale_minutes: 99999, failing_polls: 'x' }));
  const loaded = loadConfig({ WHOSE_TURN_DATA: dir });
  assert.deepEqual(loaded.settings, { poll_seconds: 60, history_days: 14, stale_minutes: 15, failing_polls: 3 });
  assert.equal(loaded.pollSeconds, 60);
  assert.equal(loaded.historyDays, 14);
  assert.equal(loaded.problems.filter((line) => /; using /.test(line)).length, 4);
  assert.match(loaded.problems.join('\n'), /poll_seconds must be a number from 15 to 3600; using 60\./);
});

test('the file and the API judge a setting by the same rule', () => {
  for (const [key, value] of [['poll_seconds', 14], ['poll_seconds', 3601], ['history_days', 2.5], ['failing_polls', 0], ['stale_minutes', 1440]]) {
    const dir = scratchDir('whose-turn-');
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ workspaces: [{ id: 'home' }], [key]: value }));
    const fromFile = loadConfig({ WHOSE_TURN_DATA: dir }).problems.some((line) => line.startsWith(`${key} must`));
    assert.equal(fromFile, settingsViolations({ [key]: value }).length > 0, `${key}=${value}`);
  }
});
