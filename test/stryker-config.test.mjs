import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(`${root}/stryker.config.json`, 'utf8'));

test('every test file the mutation run names exists, so a rename cannot break the nightly gate (RMA-363)', () => {
  // Setup
  const named = config.commandRunner.command.match(/test\/\S+\.test\.mjs/g);
  // Exercise
  const missing = named.filter((path) => !existsSync(`${root}/${path}`));
  // Verify
  assert.ok(named.length > 0);
  assert.deepEqual(missing, []);
});

test('every module the mutation run mutates matches a file (RMA-363)', () => {
  // Setup
  const patterns = config.mutate.filter((pattern) => !pattern.startsWith('!'));
  // Exercise
  const missing = patterns.filter((pattern) => globSync(pattern, { cwd: root }).length === 0);
  // Verify
  assert.ok(patterns.length > 0);
  assert.deepEqual(missing, []);
});
