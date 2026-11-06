import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

test('a scratch directory is gone once the test process that made it exits (RMA-369)', () => {
  // Setup
  const helper = new URL('./fixtures/scratch.mjs', import.meta.url).href;
  // Exercise
  const dir = execFileSync(process.execPath, ['--input-type=module', '-e', `import { scratchDir } from '${helper}'; process.stdout.write(scratchDir('wt-scratch-'));`], { encoding: 'utf8' });
  // Verify
  assert.match(dir, /wt-scratch-/);
  assert.equal(existsSync(dir), false);
});
