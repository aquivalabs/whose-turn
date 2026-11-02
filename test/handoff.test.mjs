import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandOff, snapshotOf } from '../lib/handoff.mjs';

const source = {
  data: { comments: [{ key: 'PROJ-1', at: '2026-11-01T10:00:00Z', body: 'x'.repeat(3000) }], prs: [{ key: 'PROJ-1', pr: 7, title: 't', state: 'OPEN', base: 'main', review: '', checks: 'passing', url: 'https://github.com/o/r/pull/7', last_comment_by: '', last_comment: '', secret_field: 'no' }] },
  turn: [{ row_id: 'PROJ-1', key: 'PROJ-1', summary: 'Export button', next: 'Pick it up', group: 'you' }, { row_id: 'PROJ-2', key: 'PROJ-2', summary: 'Other', next: 'QA', group: 'others' }],
  feed: [{ id: 'f1', ref: '#7', kind: 'merged', text: 'merged', key: 'PROJ-1', body: 'y'.repeat(2000) }],
  workspace: { id: 'w', name: 'W' }, rules: { approved_next: 'Merge it' }, moves: [], todos: [], errors: {}, handled: () => false,
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
