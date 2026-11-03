import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFeed, isNew, matchesQuery } from '../web/src/lib/feed.ts';
import { yourRows, waitingRows, isHandled, recentlyDone } from '../web/src/lib/moves.ts';
import { normaliseForForm, forSaving, pendingSecrets, ruleText } from '../web/src/lib/settings.ts';

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

test('your rows go by the server rank, then oldest first, and handled rows last; the handled view shows only them', () => {
  const turn = [
    { row_id: 'PROJ-3', group: 'you', rank: 3, updated: '2026-11-01', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'PROJ-2', group: 'you', rank: 3, updated: '2026-10-30', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'PROJ-9', group: 'you', rank: 2, updated: '2026-11-02', activity_at: '2026-11-02T00:00:00.000Z' },
    { row_id: 'PROJ-5', group: 'others', updated: '2026-11-02' },
    { row_id: 'PROJ-7', group: 'you', rank: 0, updated: '2026-11-02', activity_at: '2026-11-02T00:00:00.000Z' },
  ];
  const open = yourRows(turn, marks, 'open');
  assert.deepEqual(open.rows.map((item) => item.row.row_id), ['PROJ-7', 'PROJ-9', 'PROJ-3', 'PROJ-2']);
  assert.deepEqual(open.rows.map((item) => item.handled), [false, false, false, true]);
  assert.equal(open.open, 3);
  assert.equal(open.handled, 1);
  assert.deepEqual(yourRows(turn, marks, 'handled').rows.map((item) => item.row.row_id), ['PROJ-2']);
  assert.equal(isHandled(turn[1], marks), true);
  assert.deepEqual(waitingRows(turn).map((r) => r.row_id), ['PROJ-5']);
});

test('recently done lists done rows, most recently done first, capped at 15', () => {
  const done = (n, since, updated) => ({ row_id: `PROJ-${n}`, group: 'done', status_since: since, updated });
  const turn = [done(1, '2026-11-01T10:00:00Z', '2026-11-03T00:00:00Z'), done(2, '', '2026-11-02T00:00:00Z'), done(3, '2026-11-02T12:00:00Z', ''), { row_id: 'PROJ-4', group: 'you' }];
  assert.deepEqual(recentlyDone(turn).map((r) => r.row_id), ['PROJ-3', 'PROJ-2', 'PROJ-1']);
  const many = Array.from({ length: 20 }, (_, n) => done(n, `2026-10-${String(n + 1).padStart(2, '0')}T00:00:00Z`, ''));
  assert.equal(recentlyDone(many).length, 15);
  assert.equal(recentlyDone(many)[0].row_id, 'PROJ-19');
  assert.deepEqual(recentlyDone([]), []);
});

test('the settings form shapes a raw workspace both ways and lists only the secrets that were typed', () => {
  const form = normaliseForForm({ id: 'a', connectors: { github: { repo: 'x/y' } } });
  assert.deepEqual(form.connectors, [{ type: 'github', repo: 'x/y' }]);
  assert.deepEqual(forSaving(form), { id: 'a', connectors: [{ type: 'github', repo: 'x/y' }] });
  const typed = new Map([[form.connectors[0], { token: 'abc', other: '' }]]);
  assert.deepEqual(pendingSecrets([form], typed), [{ ws: 'a', connector: 'github', key: 'token', value: 'abc' }]);
});

test('the header counts and the config order come from one place each', async () => {
  const { turnCounts } = await import('../web/src/lib/moves.ts');
  const { orderWorkspaces, movedIds } = await import('../web/src/lib/settings.ts');
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

test('a rail glyph is the initials of a multi-word name or the first two letters of a single word', async () => {
  const { glyphOf, glyphSize } = await import('../web/src/lib/icons.ts');
  assert.equal(glyphOf('Whose Turn'), 'WT');
  assert.equal(glyphOf('Northwind Web'), 'NW');
  assert.equal(glyphOf('Atlas Mobile App'), 'AMA');
  assert.equal(glyphOf('Sprut'), 'SP');
  assert.equal(glyphOf('marketplaces'), 'MA');
  assert.equal(glyphOf('garden-bot'), 'GB');
  assert.equal(glyphOf(''), '?');
  assert.deepEqual(['WT', 'AMA', 'X'].map(glyphSize), [14, 11, 17]);
});

test('a rules-table row reads as when and then texts for the settings sheet', () => {
  assert.deepEqual(ruleText({ when: { 'ticket.status': ['qa', 'on_hold'], 'pr.base': { prefix: 'release/' }, unanswered_count: { gte: 2 } }, then: { whose: 'you', next: 'Merge it' } }), {
    when: 'ticket.status in qa, on_hold and pr.base starts with "release/" and unanswered_count ≥ 2', then: 'you: Merge it',
  });
  assert.deepEqual(ruleText({ when: {}, then: { whose: 'hidden' } }), { when: 'anything else', then: 'hidden' });
  assert.equal(ruleText({ when: { 'ticket.hold_reason': { present: true } }, then: { whose: 'them', next: 'x' } }).when, 'ticket.hold_reason is present');
});
