/** A scratch directory under the OS temp dir; every one this test process made is removed when it exits. RMA-369. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const made = [];
process.once('exit', () => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

export const scratchDir = (prefix = 'whose-turn-') => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
};
