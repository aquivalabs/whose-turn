import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFeed, isNew, matchesQuery } from '../web/src/lib/feed.js';
import { yourRows, waitingRows, isHandled } from '../web/src/lib/moves.js';
import { normaliseForForm, forSaving, pendingSecrets } from '../web/src/lib/settings.js';

const marks = { seen: ['b'], base: new Date('2026-11-01T00:00:00Z').getTime(), handled: { 'PROJ-2': '2026-11-02T10:00:00.000Z' } };
const items = [
  { id: 'a', key: 'PROJ-1', at: '2026-11-02T09:00:00Z', kind: 'comment', who: 'Pat', text: 'please look', body: '' },
  { id: 'b', key: 'PROJ-1', at: '2026-11-02T08:00:00Z', kind: 'status', who: '', text: 'In Review', body: '' },
  { id: 'c', key: 'PROJ-2', at: '2026-11-02T10:00:00Z', kind: 'merged', who: 'Sam', text: 'merged', body: '' },
];

test('the feed groups by ticket, newest group first, counting only unread items', () => {
  const groups = groupFeed(items, marks);
  assert.deepEqual(groups.map((g) => g.id), ['PROJ-2', 'PROJ-1']);
  assert.equal(groups[1].unread, 1);
  assert.equal(isNew(items[1], marks), false);
  assert.equal(matchesQuery(items[0], 'pat LOOK'), true);
  assert.equal(matchesQuery(items[0], 'sam'), false);
});

test('your rows put in-progress work first and handled rows last; the handled view shows only them', () => {
  const turn = [
    { row_id: 'PROJ-3', group: 'you', started: false, updated: '2026-11-01', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'PROJ-2', group: 'you', started: false, updated: '2026-10-30', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'PROJ-9', group: 'you', started: true, updated: '2026-11-02', activity_at: '2026-11-02T00:00:00.000Z' },
    { row_id: 'PROJ-5', group: 'others', updated: '2026-11-02' },
  ];
  const open = yourRows(turn, marks, 'open');
  assert.deepEqual(open.rows.map((item) => item.row.row_id), ['PROJ-9', 'PROJ-3', 'PROJ-2']);
  assert.deepEqual(open.rows.map((item) => item.handled), [false, false, true]);
  assert.equal(open.open, 2);
  assert.equal(open.handled, 1);
  assert.deepEqual(yourRows(turn, marks, 'handled').rows.map((item) => item.row.row_id), ['PROJ-2']);
  assert.equal(isHandled(turn[1], marks), true);
  assert.deepEqual(waitingRows(turn).map((r) => r.row_id), ['PROJ-5']);
});

test('the settings form shapes a raw workspace both ways and lists only the secrets that were typed', () => {
  const form = normaliseForForm({ id: 'a', connectors: { github: { repo: 'x/y' } } });
  assert.deepEqual(form.connectors, [{ type: 'github', repo: 'x/y' }]);
  assert.deepEqual(forSaving(form), { id: 'a', connectors: [{ type: 'github', repo: 'x/y' }] });
  const typed = new Map([[form.connectors[0], { token: 'abc', other: '' }]]);
  assert.deepEqual(pendingSecrets([form], typed), [{ ws: 'a', connector: 'github', key: 'token', value: 'abc' }]);
});

test('the header counts and the config order come from one place each', async () => {
  const { turnCounts } = await import('../web/src/lib/moves.js');
  const { orderWorkspaces, movedIds } = await import('../web/src/lib/settings.js');
  const turn = [
    { row_id: 'a', group: 'you', activity_at: '2026-11-02T00:00:00.000Z' },
    { row_id: 'PROJ-2', group: 'you', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'b', group: 'others', pr_state: 'OPEN', checks: 'failing' },
    { row_id: 'c', group: 'done' },
  ];
  assert.deepEqual(turnCounts(turn, marks), { mine: 1, others: 1, failing: 1, done: 1 });
  assert.deepEqual(orderWorkspaces([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['c', 'a']).map((w) => w.id), ['c', 'a', 'b']);
  assert.deepEqual(movedIds(['a', 'b', 'c'], 'c', 'a', true), ['c', 'a', 'b']);
  assert.deepEqual(movedIds(['a', 'b', 'c'], 'a', 'b', false), ['b', 'a', 'c']);
});
