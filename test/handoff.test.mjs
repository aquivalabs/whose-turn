import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandOff, snapshotOf, renderHandOff, frameHandOff } from '../lib/handoff.mjs';

const source = {
  data: { comments: [{ key: 'PROJ-1', at: '2026-11-01T10:00:00Z', body: 'x'.repeat(3000) }], prs: [{ key: 'PROJ-1', pr: 7, title: 't', state: 'OPEN', base: 'main', review: '', checks: 'passing', url: 'https://github.com/o/r/pull/7', last_comment_by: '', last_comment: '', secret_field: 'no' }] },
  turn: [{ row_id: 'PROJ-1', key: 'PROJ-1', summary: 'Export button', next: 'Pick it up', group: 'you' }, { row_id: 'PROJ-2', key: 'PROJ-2', summary: 'Other', next: 'QA', group: 'others' }],
  feed: [{ id: 'f1', ref: '#7', kind: 'merged', text: 'merged', key: 'PROJ-1', body: 'y'.repeat(2000) }],
  workspace: { id: 'w', name: 'W', connectors: [] }, rules: { approved_next: 'Merge it' }, moves: [], todos: [], errors: {}, handled: () => false,
};

test('a row hand-off carries its ticket comments and PRs with bodies capped and PR fields picked', () => {
  const context = buildHandOff('row', 'PROJ-1', source);
  assert.equal(context.row.next, 'Pick it up');
  assert.equal(context.comments[0].body.length, 1500);
  assert.deepEqual(Object.keys(context.prs[0]).includes('secret_field'), false);
});

test('a workspace hand-off lists the waiting rows; an unknown ref is null; the snapshot is a few words', () => {
  assert.deepEqual(buildHandOff('workspace', 'w', source).waiting.map((row) => row.key), ['PROJ-2']);
  assert.equal(buildHandOff('row', 'nope', source), null);
  assert.deepEqual(snapshotOf('feed', 'f1', source), { ref: '#7', kind: 'merged', text: 'merged' });
});

test('a thread hand-off gathers every feed event of one ticket, newest first, with the ticket row', () => {
  const threadSource = { ...source, feed: [{ id: 'f1', ref: '#7', kind: 'merged', text: 'merged', key: 'PROJ-1', at: '2026-11-01T12:00:00Z', body: '' }, { id: 'f2', ref: 'PROJ-1', kind: 'comment', who: 'Sam', text: 'hello', key: 'PROJ-1', at: '2026-11-01T13:00:00Z', body: 'hello there' }, { id: 'f3', ref: 'PROJ-2', kind: 'updated', key: 'PROJ-2', at: '2026-11-01T14:00:00Z', body: '' }] };
  const context = buildHandOff('thread', 'PROJ-1', threadSource);
  assert.deepEqual(context.items.map((item) => item.id), ['f1', 'f2']);
  assert.equal(context.row.key, 'PROJ-1');
  assert.deepEqual(snapshotOf('thread', 'PROJ-1', threadSource), { thread: 'PROJ-1', events: 2 });
  assert.equal(buildHandOff('thread', 'nope', threadSource), null);
});

test('every hand-off kind starts with one Whose Turn header naming the workspace and the local time', () => {
  const now = new Date(2026, 10, 3, 9, 5);
  for (const [kind, ref] of [['row', 'PROJ-1'], ['thread', 'PROJ-1'], ['feed', 'f1'], ['workspace', 'w']]) {
    const text = frameHandOff('W', [renderHandOff(kind, buildHandOff(kind, ref, source))], now);
    assert.equal(text.split('\n')[0], 'Whose Turn · W · 2026-11-03 09:05');
    assert.equal(text.split('Whose Turn ·').length, 2);
  }
});

test('the Links line lists each https URL once and skips other schemes; no links means no line', () => {
  const body = 'Ticket: https://x.example/browse/A-1\nPR https://github.com/o/r/pull/7 (https://x.example/browse/A-1) http://plain.example javascript:alert(1)\n';
  const lines = frameHandOff('W', [body]).trimEnd().split('\n');
  assert.equal(lines.at(-1), 'Links: https://x.example/browse/A-1 https://github.com/o/r/pull/7');
  assert.equal(frameHandOff('W', ['nothing here\n']).includes('Links:'), false);
});

test('the all-workspaces form has exactly one header and one Links line over every workspace body', () => {
  const text = frameHandOff('all workspaces', ['## Workspace A https://a.example/1\n', '## Workspace B https://b.example/2\n']);
  assert.equal(text.split('Whose Turn ·').length, 2);
  assert.equal(text.split('Links:').length, 2);
  assert.ok(text.includes('Links: https://a.example/1 https://b.example/2'));
});
