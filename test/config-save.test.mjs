import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveWorkspaces, normaliseWorkspaces } from '../lib/config.mjs';

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
