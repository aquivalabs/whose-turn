import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInbox, MARKER } from '../lib/inbox.mjs';

const give = (inbox, ref, snapshot = {}) => inbox.add({ ws: 'w', ws_name: 'W', kind: 'row', ref, snapshot });

test('each consumer sees an item once; the same item given twice is kept once; the marker file follows the queue', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  const inbox = openInbox(dir);
  give(inbox, 'PROJ-1', { next: 'old' });
  give(inbox, 'PROJ-1', { next: 'new' });
  give(inbox, 'PROJ-2');
  assert.deepEqual(inbox.pending().map((item) => item.ref), ['PROJ-1', 'PROJ-2']);
  assert.equal(inbox.pending()[0].snapshot.next, 'new');
  assert.ok(existsSync(join(dir, MARKER)));
  assert.equal(inbox.take('hook').length, 2);
  assert.equal(inbox.take('hook').length, 0);
  assert.equal(inbox.take('mcp:codex').length, 2);
  assert.equal(openInbox(dir).pending('hook').length, 0);
  assert.equal(openInbox(dir).pending('mcp:other').length, 2);
  inbox.clear();
  assert.ok(!existsSync(join(dir, MARKER)));
});
