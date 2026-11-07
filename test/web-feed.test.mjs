import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reactive } from 'vue';
import { groupFeed, isNew, kindsLabel, moveKeys, matchesQuery, badgeOf, subjectOf, itemLine } from '../web/src/lib/feed.ts';
import { yourRows, waitingRows, recentlyDone, statusTone } from '../web/src/lib/moves.ts';
import { topLayer } from '../web/src/lib/layers.ts';
import { modifier } from '../web/src/lib/bem.ts';
import { liveStatus } from '../web/src/lib/live-status.ts';
import { normaliseForForm, forSaving, pendingSecrets, ruleText, settingsKey } from '../web/src/lib/settings.ts';
import { FACTS } from '../lib/facts.mjs';
import { latestWins } from '../web/src/lib/latest-wins.ts';
import { writeProblem, errorProblem, UNREACHABLE_TEXT, TEXT_KEPT } from '../web/src/lib/problems.ts';

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

test('a PR item without a ticket carries its title into the group head and its own line, and badges follow the connector label', () => {
  const pr = { id: 'p', ref: 'garden-bot#12', key: '', title: 'Skip rainy days', at: '2026-11-02T09:00:00Z', kind: 'comment', text: 'Rebased' };
  const ask = { id: 'q', ref: 'garden-bot#13', key: '', title: 'Frost warning', at: '2026-11-02T08:00:00Z', kind: 'review requested', text: 'Frost warning' };
  assert.deepEqual(groupFeed([pr, ask], marks).map((g) => [g.id, g.title]), [['garden-bot#12', 'Skip rainy days'], ['garden-bot#13', 'Frost warning']]);
  assert.equal(itemLine(pr), 'Skip rainy days · Rebased');
  assert.equal(itemLine(ask), 'Frost warning');
  assert.equal(subjectOf({ ...pr, key: 'PROJ-1' }), 'PROJ-1');
  assert.equal(subjectOf({ ...items[0], ref: 'PROJ-1' }), '');
  assert.equal(itemLine({ ...items[0], ref: 'PROJ-1' }), 'please look');
  assert.equal(matchesQuery(pr, 'rainy'), true);
  assert.deepEqual([{ type: 'github', label: 'GitHub', badge: 'GH' }, { type: 'github', label: 'work', badge: '' }, { type: 'demo', label: 'tracker' }, { type: 'demo', label: 'Demo code' }].map((source) => badgeOf({ id: 'x', ...source })), ['GH', 'WO', 'TR', 'DC']);
});

test('a group head names the first two distinct kinds and counts the rest as +n', () => {
  const kinds = (...names) => names.map((kind) => ({ kind }));
  assert.equal(kindsLabel(kinds('comment', 'comment', 'status')), 'comment · status');
  assert.equal(kindsLabel(kinds('status', 'comment', 'merged', 'comment', 'reassigned')), 'status · comment +2');
  assert.equal(kindsLabel(kinds('merged')), 'merged');
  assert.equal(kindsLabel([]), '');
});

test('your rows go by the server rank, then oldest first, and the open view lists only open rows; the handled view only handled ones', () => {
  const turn = [
    { row_id: 'PROJ-3', group: 'you', rank: 3, updated: '2026-11-01', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'PROJ-2', group: 'you', rank: 3, updated: '2026-10-30', activity_at: '2026-11-01T00:00:00.000Z', handled: true },
    { row_id: 'PROJ-9', group: 'you', rank: 2, updated: '2026-11-02', activity_at: '2026-11-02T00:00:00.000Z' },
    { row_id: 'PROJ-5', group: 'others', updated: '2026-11-02' },
    { row_id: 'PROJ-7', group: 'you', rank: 0, updated: '2026-11-02', activity_at: '2026-11-02T00:00:00.000Z' },
  ];
  const open = yourRows(turn, 'open');
  assert.deepEqual(open.rows.map((item) => item.row.row_id), ['PROJ-7', 'PROJ-9', 'PROJ-3']);
  assert.deepEqual(open.rows.map((item) => item.handled), [false, false, false]);
  assert.equal(open.open, 3);
  assert.equal(open.handled, 1);
  assert.deepEqual(yourRows(turn, 'handled').rows.map((item) => item.row.row_id), ['PROJ-2']);
  assert.deepEqual(yourRows(turn, 'handled').rows.map((item) => item.handled), [true]);
  assert.deepEqual(waitingRows(turn).map((r) => r.row_id), ['PROJ-5']);
});

test('the handled view keeps a row whose turn passed on while its automatic mark lives, and the open view never lists it', () => {
  const turn = [
    { row_id: 'PROJ-1', group: 'others', rank: 3, updated: '2026-11-02', handled: true },
    { row_id: 'PROJ-2', group: 'others', rank: 3, updated: '2026-11-02', handled: true },
  ];
  const info = { 'PROJ-1': { auto: true, outcome: 'Merged' } };
  assert.deepEqual(yourRows(turn, 'open', info).rows, []);
  assert.deepEqual(yourRows(turn, 'handled', info).rows.map((item) => item.row.row_id), ['PROJ-1']);
  assert.equal(yourRows(turn, 'open', info).handled, 1);
});

test('a feed group carries the your-move bar while any row of its ticket on you is open, not once all are handled or off you', () => {
  const handled = { row_id: 'PROJ-2', key: 'PROJ-2', group: 'you', handled: true };
  const open = { row_id: 'PROJ-2:c1', key: 'PROJ-2', group: 'you', handled: false };
  assert.deepEqual([...moveKeys([handled, open])], ['PROJ-2']);
  assert.deepEqual([...moveKeys([handled])], []);
  assert.deepEqual([...moveKeys([{ ...open, key: 'PROJ-5', group: 'others' }])], []);
  assert.deepEqual([...moveKeys([])], []);
});

test('a status pill takes its tone from the status group the server sent, not from the words', () => {
  assert.equal(statusTone('code_review'), 'info');
  assert.equal(statusTone('qa'), 'info');
  assert.equal(statusTone('on_hold'), 'hold');
  assert.equal(statusTone('passed'), '');
  assert.equal(statusTone(''), '');
  assert.equal(statusTone(undefined), '');
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

test('the settings form is dirty only once its list differs from the copy taken at load', () => {
  const form = reactive([normaliseForForm({ id: 'a', name: 'A' })]);
  const loaded = settingsKey(form);
  assert.equal(settingsKey(form), loaded);
  form[0].name = 'B';
  assert.notEqual(settingsKey(form), loaded);
  form[0].name = 'A';
  assert.equal(settingsKey(form), loaded);
});

test('a workspace held in a reactive form still shapes for saving', () => {
  const form = reactive(normaliseForForm({ id: 'a', connectors: { github: { repo: 'x/y' } } }));
  assert.deepEqual(forSaving(form), { id: 'a', connectors: [{ type: 'github', repo: 'x/y' }] });
  assert.deepEqual(normaliseForForm(form).connectors, [{ type: 'github', repo: 'x/y' }]);
});

test('the config order comes from one place', async () => {
  const { orderWorkspaces, movedIds } = await import('../web/src/lib/settings.ts');
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

test('a rules-table row reads as a sentence for the settings sheet', () => {
  const rule = (row) => ruleText(row, FACTS);
  assert.deepEqual(rule({ when: { 'ticket.status': 'code_review', 'pr.open': true, 'pr.review': 'approved' }, then: { whose: 'you', next: 'Merge it' } }), {
    when: 'When the ticket is in review and the PR is open and the PR is approved:', then: 'your move, "Merge it"',
  });
  assert.deepEqual(rule({ when: { 'ticket.status': ['qa', 'on_hold'], 'pr.base': { prefix: 'release/' }, unanswered_count: { gte: 2 } }, then: { whose: 'them', next: 'x' } }), {
    when: 'When the ticket is in testing or on hold and the PR goes into a branch starting with release/ and at least 2 mentions of you wait for an answer:', then: 'waiting on others, "x"',
  });
  assert.deepEqual(rule({ when: {}, then: { whose: 'hidden' } }), { when: 'In every other case:', then: 'not shown' });
  assert.equal(rule({ when: { 'ticket.hold_reason': { present: true } }, then: { whose: 'them', next: 'On hold: {ticket.hold_reason}' } }).then, 'waiting on others, "On hold: {the hold reason}"');
  assert.equal(rule({ when: { 'ticket.status': 'qa', 'pr.open': false }, then: { whose: 'qa', next: 'x' } }).when, 'When the ticket is in testing and no PR is open:');
});

test('a refused write names what was not saved, a network failure the server-down line, a confirmed one nothing', () => {
  assert.equal(writeProblem({ error: { message: 'disk full' } }), 'Not saved: disk full');
  assert.equal(writeProblem({ error: { message: '' } }), 'Not saved: the server refused the change.');
  assert.equal(writeProblem({ error: { message: 'disk full' } }, { refused: 'The order was not saved' }), 'The order was not saved: disk full');
  assert.equal(writeProblem(new Error('unreachable')), UNREACHABLE_TEXT);
  assert.equal(writeProblem(new Error('unreachable'), { unreachable: TEXT_KEPT }), TEXT_KEPT);
  assert.ok(UNREACHABLE_TEXT.startsWith('The local server is not answering'));
  assert.equal(writeProblem(new Error('Unexpected token')), 'Not saved: Unexpected token');
  assert.equal(writeProblem(null), '');
  assert.equal(writeProblem({}), '');
  assert.equal(writeProblem([{ id: 't1' }]), '');
  assert.equal(writeProblem({ seen: [], base: 0, handled: {} }), '');
});

test('a refused request says what its reason means, not the raw message', () => {
  const envelope = (reason, message = 'raw upstream text') => ({ error: { message, details: [{ '@type': 'ErrorInfo', reason }] } });
  assert.equal(writeProblem(envelope('NO_WORKSPACE')), 'No workspace configured. Add one with + in the rail.');
  assert.equal(writeProblem(envelope('UPSTREAM_FAILED')), 'The tracker did not answer; try again in a minute.');
  assert.equal(writeProblem(envelope('RATE_LIMITED')), 'The source is rate-limited; the monitor backs off.');
  assert.equal(writeProblem(envelope('INTERNAL', 'disk full')), 'The local server failed; see its log.');
  assert.equal(writeProblem(envelope('INVALID_ARGUMENT', 'a title is required')), 'Not saved: a title is required');
  assert.equal(errorProblem(envelope('NO_SUCH_WORKSPACE', 'No such workspace.').error, 'Could not load'), 'Could not load: No such workspace.');
});

test('the live status is red when every source fails, amber when some do, green otherwise', () => {
  const fresh = new Date().toISOString();
  const health = (failing, stale = false) => ({ ok: !failing.length && !stale, stale, fresh_at: fresh, failing: failing.map((source) => ({ source, polls: 3 })), alerts: [] });
  const all = liveStatus(health(['trello']), fresh, 1, true);
  assert.equal(all.dot, 'off');
  assert.equal(all.noData, true);
  assert.equal(all.text, 'No data: trello failing · last data now');
  const some = liveStatus(health(['trello']), fresh, 2, true);
  assert.equal(some.dot, 'warn');
  assert.equal(some.noData, false);
  assert.match(some.text, /^trello failing · last check now/);
  assert.equal(liveStatus(health(['a']), fresh, 2, false).dot, 'off');
  const ok = liveStatus(health([]), fresh, 1, true);
  assert.equal(ok.dot, 'ok');
  assert.match(ok.text, /^Live · last check now/);
  assert.match(liveStatus(health([], true), fresh, 1, true).text, /^Stale · last data now/);
});

test('a clipped table counts the rows that end below the visible bottom, forgiving a cut through the cell padding', async () => {
  const { hiddenBelow } = await import('../web/src/lib/moves.ts');
  assert.equal(hiddenBelow([100, 200, 300, 400], 250), 2);
  assert.equal(hiddenBelow([100, 200, 300], 300), 0);
  assert.equal(hiddenBelow([100, 210, 300], 200, 13), 1);
  assert.equal(hiddenBelow([], 0), 0);
});

test('Escape goes to the topmost layer: the comment modal, then Settings, then Report', () => {
  assert.equal(topLayer({ modal: {}, settings: true, feedback: true }), 'modal');
  assert.equal(topLayer({ modal: null, settings: true, feedback: true }), 'settings');
  assert.equal(topLayer({ modal: null, settings: false, feedback: true }), 'feedback');
  assert.equal(topLayer({ modal: null, settings: false, feedback: false }), null);
});

test('only the reply to the newest request is accepted', () => {
  const requests = latestWins();
  const first = requests.next();
  assert.equal(requests.accepts(first), true);
  const second = requests.next();
  assert.equal(requests.accepts(first), false);
  assert.equal(requests.accepts(second), true);
});

test('a BEM modifier names the block and the tone, and an empty tone adds no class', () => {
  assert.equal(modifier('pill', 'bad'), 'pill--bad');
  assert.equal(modifier('feed-item__icon', 'jira'), 'feed-item__icon--jira');
  assert.equal(modifier('pill', ''), '');
});
