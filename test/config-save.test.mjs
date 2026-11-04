import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveWorkspaces, saveNotifications, normaliseWorkspaces } from '../lib/config.mjs';

test('saving the workspace list keeps the other top-level keys and drops the flat legacy keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const file = join(dir, 'nested', 'config.json');
  saveWorkspaces(file, [{ id: 'home' }]);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { workspaces: [{ id: 'home' }] });
  assert.equal(existsSync(`${file}.bak`), false);
});

test('saving keeps the previous file as config.json.bak', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ workspaces: [{ id: 'home' }], feedback: { team: 'T', future_key: 1 } }));
  assert.deepEqual(loadConfig({ WHOSE_TURN_CONFIG: file, WHOSE_TURN_DATA: dir }).feedback, { future_key: 1 });
  saveWorkspaces(file, [{ id: 'home' }]);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).feedback, { future_key: 1 });
});

test('saveNotifications writes the setting and keeps the other keys; loadConfig reads it back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const file = join(dir, 'config.json');
  saveWorkspaces(file, [{ id: 'w' }]);
  saveNotifications(file, { desktop: false });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { workspaces: [{ id: 'w' }], notifications: { desktop: false } });
  assert.deepEqual(loadConfig({ WHOSE_TURN_DATA: dir }).notifications, { desktop: false });
  saveWorkspaces(file, [{ id: 'w' }]);
  assert.deepEqual(loadConfig({ WHOSE_TURN_DATA: dir }).notifications, { desktop: false });
});

test('saveNotifications starts from an empty config when the file is missing or unparseable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const missing = join(dir, 'missing', 'config.json');
  saveNotifications(missing, { desktop: true });
  assert.deepEqual(JSON.parse(readFileSync(missing, 'utf8')), { notifications: { desktop: true } });
  const broken = join(dir, 'config.json');
  writeFileSync(broken, '{ not json');
  saveNotifications(broken, { desktop: false });
  assert.deepEqual(JSON.parse(readFileSync(broken, 'utf8')), { notifications: { desktop: false } });
  assert.equal(readFileSync(`${broken}.bak`, 'utf8'), '{ not json');
});
