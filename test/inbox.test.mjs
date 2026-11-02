import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInbox } from '../lib/inbox.mjs';

test('an item waits until taken, the same item given twice is kept once, and a take survives a reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const inbox = openInbox(dir);
  inbox.add({ ws: 'w', kind: 'row', ref: 'PROJ-1', context: { row: { key: 'PROJ-1' } } });
  inbox.add({ ws: 'w', kind: 'row', ref: 'PROJ-1', context: { row: { key: 'PROJ-1', next: 'newer' } } });
  inbox.add({ ws: 'w', kind: 'workspace', ref: 'w', context: {} });
  assert.deepEqual(inbox.pending().map((item) => item.ref), ['PROJ-1', 'w']);
  assert.equal(inbox.pending()[0].context.row.next, 'newer');
  assert.equal(inbox.take().length, 2);
  assert.deepEqual(openInbox(dir).pending(), []);
});
