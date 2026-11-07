import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openStore } from '../lib/store.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

test('a workspace id that resolves outside the data directory is refused before anything is created', () => {
  const parent = scratchDir('wt-path-');
  const dir = join(parent, 'data');
  for (const id of ['../../escape', '..', '', '../x', '/abs']) {
    assert.throws(() => openStore(dir, id), /outside the data directory/, id);
  }
  assert.ok(!existsSync(join(parent, 'escape')));
  assert.ok(!existsSync(dir));
});

test('a plain id opens inside the data directory', () => {
  const dir = scratchDir('wt-path-');
  openStore(dir, 'ok-1').saveMarks();
  assert.ok(existsSync(join(dir, 'workspaces', 'ok-1', 'marks.json')));
});
