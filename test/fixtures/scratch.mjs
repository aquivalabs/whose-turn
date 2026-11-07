/** A scratch directory under one parent in the OS temp dir; removed when the test process exits, and any left by a killed process is swept on the next load. RMA-369. */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(tmpdir(), 'whose-turn-tests');
const STALE_MS = 10 * 60 * 1000;

mkdirSync(ROOT, { recursive: true });
for (const name of readdirSync(ROOT)) {
  const path = join(ROOT, name);
  try {
    if (Date.now() - statSync(path).mtimeMs > STALE_MS) {
      rmSync(path, { recursive: true, force: true });
    }
  } catch {
    // RMA-369: another test process removed it first
  }
}

const made = [];
process.once('exit', () => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

export const scratchDir = (prefix = 'whose-turn-') => {
  const dir = mkdtempSync(join(ROOT, prefix));
  made.push(dir);
  return dir;
};
