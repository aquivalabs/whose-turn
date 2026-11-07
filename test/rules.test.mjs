import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRules, turnRows, feedRows, myMoves, withHandled, turnCounts } from '../lib/rules.mjs';
import { holdReason, ticketFacts, runFacts, shortDate, FACTS, statusGroupOrder, statusGroups, chainGroup } from '../lib/facts.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { ticket, pr, comment, ask } from './fixtures/rules.mjs';

const me = { jira: 'Alex Doe', github: 'alex' };
const rows = (state, rules = DEFAULT_RULES) => turnRows(state, { me, rules: compileRules(rules), historyDays: 3650, ticketUrl: (key) => `https://your-site.atlassian.net/browse/${key}` });
const only = (list, predicate) => {
  const hits = list.filter(predicate);
  assert.equal(hits.length, 1, `expected one row, got ${hits.length}: ${JSON.stringify(list.map((row) => row.next))}`);
  return hits[0];
};

test('failing checks on an open PR beat every other rule', () => {
  const row = only(rows({ tickets: [ticket({ status: 'Passed' })], prs: [pr({ checks: 'failing' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(row.group, 'you');
  assert.equal(row.next, 'Look at the failing checks');
});

test('an approved PR into a release branch uses the release wording from the rules', () => {
  const rules = { ...DEFAULT_RULES, approved_release_next: 'Ask QA to pick it up' };
  const row = only(rows({ tickets: [ticket({ status: 'Code Review' })], prs: [pr({ review: 'APPROVED', base: 'release/2.5' })] }, rules), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(row.next, 'Ask QA to pick it up');
});

test('status words come from the rules, so a team can call code review "In Review"', () => {
  const row = only(rows({ tickets: [ticket({ status: 'In Review' })], prs: [pr()] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(row.whose, 'Reviewer');
  assert.equal(row.group, 'others');
});

test('a ticket in code review names the reviewers still requested on its PR, and falls back to Reviewer without any', () => {
  const named = only(rows({ tickets: [ticket({ status: 'Code Review' })], prs: [pr({ reviewers: [{ name: 'sam', state: '' }, { name: 'core-team', state: '' }] })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(named.whose, 'sam, core-team');
  assert.equal(named.next, 'Code review');
  const bare = only(rows({ tickets: [ticket({ status: 'Code Review' })], prs: [pr({ reviewers: [] })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(bare.whose, 'Reviewer');
});

test('every reviewer is listed with a check for approved and a cross for changes requested, structured on the row and spelled out in whose', () => {
  const reviewers = [{ name: 'sam', state: '' }, { name: 'ann', state: 'approved' }, { name: 'bob', state: 'changes' }, { name: 'cy', state: '' }, { name: 'di', state: 'approved' }, { name: 'ed', state: '' }, { name: 'flo', state: '' }];
  const row = only(rows({ tickets: [ticket({ status: 'Code Review' })], prs: [pr({ reviewers })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(row.whose, 'sam, ✓ ann, ✗ bob, cy, ✓ di, ed, flo');
  assert.deepEqual(row.reviewers, reviewers);
});

test('your own GitHub login among the reviewers reads you, and a row not waiting on reviewers carries none', () => {
  const mine = only(rows({ tickets: [ticket({ status: 'Code Review' })], prs: [pr({ reviewers: [{ name: 'alex', state: 'approved' }, { name: 'sam', state: '' }] })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(mine.whose, '✓ you, sam');
  assert.deepEqual(mine.reviewers.map((reviewer) => reviewer.name), ['you', 'sam']);
  const failing = only(rows({ tickets: [ticket({ status: 'Code Review' })], prs: [pr({ checks: 'failing', reviewers: [{ name: 'sam', state: '' }] })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.deepEqual(failing.reviewers, []);
});

test('a backlog ticket is left out, on me or not, unless it has an open PR', () => {
  assert.equal(only(rows({ tickets: [ticket({ status: 'Backlog', assignee: 'Someone Else' })] }), (candidate) => candidate.row_id === 'PROJ-1').group, 'gone');
  assert.equal(only(rows({ tickets: [ticket({ status: 'Backlog' })] }), (candidate) => candidate.row_id === 'PROJ-1').group, 'gone');
  assert.equal(only(rows({ tickets: [ticket({ status: 'Backlog' })], prs: [pr({ checks: 'failing' })] }), (candidate) => candidate.row_id === 'PROJ-1').next, 'Look at the failing checks');
  const listed = only(rows({ tickets: [ticket({ status: 'Backlog' })] }, { ...DEFAULT_RULES, backlog_rows: 'list' }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(listed.group, 'others');
  assert.equal(listed.next, 'Backlog');
});

test('a question that @-mentions me is my move until I @-mention the asker back', () => {
  const asked = { tickets: [ticket()], comments: [comment()] };
  assert.equal(only(rows(asked), (candidate) => candidate.row_id === 'PROJ-1:c1').next, 'Answer Sam Reviewer in the ticket');
  const answered = { ...asked, comments: [comment(), comment({ id: 'c2', at: '2026-11-01T12:30:00Z', author: 'Alex Doe', body: '@Sam Reviewer yes, half up.' })] };
  assert.equal(rows(answered).filter((candidate) => candidate.row_id === 'PROJ-1:c1').length, 0);
});

test('a mention without a question is a read, not an answer', () => {
  const row = only(rows({ tickets: [ticket()], comments: [comment({ body: '@Alex Doe fyi, deployed to staging.' })] }), (candidate) => candidate.row_id === 'PROJ-1:c1');
  assert.equal(row.next, 'Read Sam Reviewer’s comment in the ticket');
});

test('an open PR whose ticket is not in my list asks me to check the ticket', () => {
  const row = only(rows({ tickets: [], prs: [pr({ key: 'PROJ-9' })] }), (candidate) => candidate.row_id === 'PROJ-9');
  assert.equal(row.next, 'Check the ticket for this open PR');
  assert.equal(row.ticket_url, 'https://your-site.atlassian.net/browse/PROJ-9');
  assert.equal(row.url, row.ticket_url);
});

test('a review request from GitHub is a row of its own', () => {
  const row = only(rows({ asks: [ask()] }), (candidate) => candidate.row_id === 'gha:1');
  assert.equal(row.next, 'Review this PR');
});

test('a handled mark hides a row until something newer happens on it', () => {
  const list = rows({ tickets: [ticket()], prs: [pr({ checks: 'failing', updated_at: '2026-11-01T11:00:00Z' })] });
  assert.equal(myMoves(list, { handled: { 'PROJ-1': '2026-11-01T12:00:00Z' } }).length, 0);
  assert.equal(myMoves(list, { handled: { 'PROJ-1': '2026-11-01T10:00:00Z' } }).length, 1);
});

test('every row carries the handled flag from the same rule as myMoves', () => {
  const list = rows({ tickets: [ticket()], prs: [pr({ checks: 'failing', updated_at: '2026-11-01T11:00:00Z' })] });
  const row = (marks) => only(withHandled(list, marks), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(row({ handled: { 'PROJ-1': '2026-11-01T12:00:00Z' } }).handled, true);
  assert.equal(row({ handled: { 'PROJ-1': '2026-11-01T10:00:00Z' } }).handled, false);
  assert.equal(row({ handled: {} }).handled, false);
  assert.equal(list[0].handled, undefined);
});

test('a row names its chain status group, and a mention row the group of its ticket', () => {
  const group = (status) => only(rows({ tickets: [ticket({ status })], prs: [pr()] }), (candidate) => candidate.row_id === 'PROJ-1').status_group;
  assert.equal(group('In Review'), 'code_review');
  assert.equal(group('Ready for QA'), 'qa');
  assert.equal(group('On Hold'), 'on_hold');
  assert.equal(group('Passed'), 'passed');
  assert.equal(group('Ice Box'), '');
  const mention = only(rows({ tickets: [ticket({ status: 'Ready for QA' })], comments: [comment()] }), (candidate) => candidate.row_id === 'PROJ-1:c1');
  assert.equal(mention.status_group, 'qa');
  assert.equal(only(rows({ asks: [ask()] }), (candidate) => candidate.row_id === 'gha:1').status_group, '');
});

test('the counts are the open moves, waiting, failing and done, with handled rows left out of mine', () => {
  const list = [
    { row_id: 'a', group: 'you', activity_at: '2026-11-02T00:00:00.000Z' },
    { row_id: 'PROJ-2', group: 'you', activity_at: '2026-11-01T00:00:00.000Z' },
    { row_id: 'b', group: 'others', pr_state: 'OPEN', checks: 'failing' },
    { row_id: 'c', group: 'done' },
  ];
  const marks = { handled: { 'PROJ-2': '2026-11-02T10:00:00.000Z' } };
  assert.deepEqual(turnCounts(list, marks), { mine: 1, others: 1, failing: 1, done: 1 });
  assert.equal(turnCounts(list, marks).mine, myMoves(list, marks).length);
  assert.equal(turnCounts(list, { handled: {} }).mine, 2);
});

test('the on-hold reason is the mover’s comment closest to the status change', () => {
  const held = ticket({ status: 'On Hold', status_change: { since: '2026-11-01T12:05:00Z', by: 'Sam Reviewer' } });
  const comments = [
    comment({ id: 'old', at: '2026-10-20T12:00:00Z', body: 'Something unrelated' }),
    comment({ id: 'why', at: '2026-11-01T12:04:00Z', body: 'On hold: waiting for the vendor API key.' }),
  ];
  assert.equal(holdReason(comments, held).text, 'waiting for the vendor API key.');
  assert.match(only(rows({ tickets: [held], comments }), (candidate) => candidate.row_id === 'PROJ-1').next, /^On hold: waiting/);
});

test('the feed marks a mention of me and hides a ticket update that a comment already explains', () => {
  const state = { tickets: [ticket({ updated: '2026-11-01T12:00:30.000+0000' })], comments: [comment()], activity: [], events: [], asks: [] };
  const feed = feedRows(state, { me, rules: compileRules(DEFAULT_RULES), historyDays: 3650 });
  assert.deepEqual(feed.map((row) => row.id), ['comment:jira:c1']);
  assert.equal(feed[0].mention, true);
});

test('an open ticket on me says Continue the work when it is in progress and Pick it up when it is not started', () => {
  const started = only(rows({ tickets: [ticket({ status: 'In Progress', status_category: 'indeterminate' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(started.next, 'Continue the work');
  assert.equal(started.group, 'you');
  const todo = only(rows({ tickets: [ticket({ status: 'Todo', status_category: 'new' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(todo.next, 'Pick it up');
});

test('a row on me carries started so the window can order in-progress work first without reading the text', () => {
  const started = only(rows({ tickets: [ticket({ status: 'In Progress', status_category: 'indeterminate' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(started.started, true);
  const todo = only(rows({ tickets: [ticket({ status: 'Todo', status_category: 'new' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(todo.started, false);
});

test('every row carries a rank: failing checks, then requested changes, then work in progress, then the rest', () => {
  const rankOf = (state) => only(rows(state), (candidate) => candidate.row_id === 'PROJ-1').rank;
  assert.equal(rankOf({ tickets: [ticket({ status: 'In Review' })], prs: [pr({ checks: 'failing' })] }), 0);
  assert.equal(rankOf({ tickets: [ticket({ status: 'In Review' })], prs: [pr({ review: 'CHANGES_REQUESTED' })] }), 1);
  assert.equal(rankOf({ tickets: [ticket({ status: 'In Progress', status_category: 'indeterminate' })] }), 2);
  assert.equal(rankOf({ tickets: [ticket({ status: 'Todo', status_category: 'new' })] }), 3);
  assert.equal(rankOf({ tickets: [ticket({ status: 'Passed' })] }), 3);
  assert.equal(rankOf({ tickets: [ticket({ status: 'Done', status_category: 'done' })] }), 3);
});

test('a review request names the PR in the next step only when it has a ticket', () => {
  const keyed = only(rows({ asks: [ask({ key: 'PROJ-1' })] }), (candidate) => candidate.row_id === 'gha:1');
  assert.equal(keyed.next, 'Review PR other-repo#12');
});

test('a ticket waiting for a release assigned to me waits under Waiting on others, and an open PR step still wins', () => {
  const waiting = only(rows({ tickets: [ticket({ status: 'Ready for release' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(waiting.group, 'others');
  assert.equal(waiting.whose, 'Release');
  assert.equal(waiting.next, 'the next release');
  assert.equal(waiting.status_group, 'release');
  const failing = only(rows({ tickets: [ticket({ status: 'Awaiting release' })], prs: [pr({ checks: 'failing' })] }), (candidate) => candidate.row_id === 'PROJ-1');
  assert.equal(failing.group, 'you');
  assert.equal(failing.next, 'Look at the failing checks');
});

test('a workspace that sets its own statuses keeps the release group from the defaults', () => {
  const rules = { ...DEFAULT_RULES, statuses: { ...DEFAULT_RULES.statuses, release: ['shipping'] } };
  assert.equal(only(rows({ tickets: [ticket({ status: 'Shipping' })] }, rules), (candidate) => candidate.row_id === 'PROJ-1').whose, 'Release');
});

test('a ticket you were only mentioned on gives its mention row and no ticket row (RMA-86)', () => {
  // Setup
  const state = { tickets: [ticket({ assignee: 'Sam Reviewer', mention_only: true })], comments: [comment()] };
  // Exercise
  const result = rows(state);
  // Verify
  assert.deepEqual(result.map((row) => row.row_id), ['PROJ-1:c1']);
  assert.equal(result[0].group, 'you');
});

test('a ticket you were only mentioned on gives no touched feed row (RMA-86)', () => {
  // Setup
  const state = { tickets: [ticket({ assignee: 'Sam Reviewer', mention_only: true, updated: '2026-11-02T10:00:00.000+0000' })], comments: [] };
  // Exercise
  const feed = feedRows(state, { me, rules: compileRules(DEFAULT_RULES), historyDays: 3650 });
  // Verify
  assert.deepEqual(feed.filter((item) => item.kind === 'touched'), []);
});

const noteAt = (id, at, author, body) => ({ id, at, author, body, url: `https://example.test/${id}` });
const heldTicket = { key: 'PROJ-123', status: 'On Hold', status_change: { since: '2026-11-01T12:00:00Z', by: 'sam' } };

test('every fact in the dictionary declares its type, its plain words and where it comes from', () => {
  // Setup
  const entries = Object.entries(FACTS);
  // Exercise
  const broken = entries.filter(([, fact]) => {
    const typed = ['string', 'number', 'boolean'].includes(fact.type) && typeof fact.from === 'string' && fact.from.length > 0;
    const worded = fact.type === 'boolean' ? Array.isArray(fact.says) && fact.says.length === 2 && fact.says.every((line) => typeof line === 'string' && line) : typeof fact.name === 'string' && fact.name.length > 0;
    return !(typed && worded);
  });
  // Verify
  assert.deepEqual(broken.map(([id]) => id), []);
  assert.deepEqual(FACTS['pr.checks'].values, ['passing', 'failing', 'running', 'none']);
  assert.deepEqual(FACTS['pr.review'].values, ['approved', 'changes_requested', 'none']);
});

test('shortDate writes a month and a day in English', () => {
  // Setup
  const iso = '2026-11-01T12:00:00Z';
  // Exercise
  const text = shortDate(iso);
  // Verify
  assert.equal(text, 'Nov 1');
});

test('status groups try the chain first, then extra groups, and the category fallbacks come last', () => {
  // Setup
  const statuses = { review_extra: ['Waiting'], qa: ['QA'], backlog: ['Backlog'] };
  // Exercise
  const order = statusGroupOrder(statuses);
  const all = statusGroups(statuses);
  // Verify
  assert.deepEqual(order, ['backlog', 'qa', 'review_extra']);
  assert.deepEqual(all, ['backlog', 'qa', 'review_extra', 'todo', 'in_progress', 'done']);
  assert.equal(chainGroup('qa'), 'qa');
  assert.equal(chainGroup('review_extra'), '');
});

test('the hold reason is the comment by whoever moved the ticket, nearest to the move', () => {
  // Setup
  const comments = [
    noteAt('far', '2026-11-01T11:00:00Z', 'sam', 'Earlier note from sam.'),
    noteAt('near', '2026-11-01T12:30:00Z', 'sam', 'Waiting on legal. More text.'),
    noteAt('other', '2026-11-01T12:00:00Z', 'pat', 'A note from pat.'),
  ];
  // Exercise
  const reason = holdReason(comments, heldTicket);
  // Verify
  assert.equal(reason.text, 'Waiting on legal.');
  assert.equal(reason.url, 'https://example.test/near');
});

test('a comment by the mover more than two days from the move is not taken for the reason', () => {
  // Setup
  const comments = [noteAt('stale', '2026-10-29T12:00:00Z', 'sam', 'Old note.'), noteAt('before', '2026-11-01T11:55:00Z', 'pat', 'Parked for budget.')];
  // Exercise
  const reason = holdReason(comments, heldTicket);
  // Verify
  assert.equal(reason.text, 'Parked for budget.');
  assert.equal(holdReason([noteAt('exact', '2026-11-03T12:00:00Z', 'sam', 'Exact note.'), noteAt('before', '2026-11-01T11:55:00Z', 'pat', 'Parked for budget.')], heldTicket).text, 'Parked for budget.');
});

test('a comment by the mover just under two days from the move is still the reason', () => {
  // Setup
  const comments = [noteAt('edge', '2026-11-03T11:59:00Z', 'sam', 'Edge note.'), noteAt('before', '2026-11-01T11:55:00Z', 'pat', 'Other note.')];
  // Exercise
  const reason = holdReason(comments, heldTicket);
  // Verify
  assert.equal(reason.text, 'Edge note.');
});

test('without a mover comment the newest comment up to ten minutes after the move is the reason, and later ones are not', () => {
  // Setup
  const comments = [
    noteAt('early', '2026-11-01T11:00:00Z', 'pat', 'Early note.'),
    noteAt('edge', '2026-11-01T12:10:00Z', 'pat', 'Edge note.'),
    noteAt('late', '2026-11-01T12:11:00Z', 'pat', 'Late note.'),
  ];
  // Exercise
  const reason = holdReason(comments, heldTicket);
  // Verify
  assert.equal(reason.text, 'Edge note.');
});

test('without a status change the newest comment that says on hold is the reason', () => {
  // Setup
  const comments = [noteAt('a', '2026-11-01T10:00:00Z', 'pat', 'Unrelated.'), noteAt('b', '2026-11-01T11:00:00Z', 'pat', 'ON HOLD - old reason.'), noteAt('c', '2026-11-01T12:00:00Z', 'pat', 'We are on hold until Friday.')];
  // Exercise
  const reason = holdReason(comments, { key: 'PROJ-123', status: 'On Hold' });
  // Verify
  assert.equal(reason.text, 'We are on hold until Friday.');
  assert.equal(holdReason([comments[0]], { key: 'PROJ-123', status: 'On Hold' }), null);
  assert.equal(holdReason(comments, { key: 'PROJ-123', status: 'On Hold', status_change: { by: 'sam' } }).text, 'We are on hold until Friday.');
});

test('the hold reason strips a leading mention, the on hold label, images, bold and code marks, and keeps one sentence', () => {
  // Setup
  const at = '2026-11-01T12:05:00Z';
  const plain = (body) => holdReason([noteAt('x', at, 'sam', body)], heldTicket).text;
  // Exercise and Verify
  assert.equal(plain('@Pat Lee - **Blocked** on `vendor`. Second sentence.'), 'Blocked on vendor.');
  assert.equal(plain('[image]\n\nOn hold: waiting for access! Then more.'), 'waiting for access!');
  assert.equal(plain('Sam says on hold - needs review?  Next.'), 'needs review?');
  assert.equal(plain('On hold:'), 'On hold:');
  assert.equal(plain('@pat  — x'), 'x');
  assert.equal(plain('@Pat Lee ok'), '@Pat Lee ok');
  assert.equal(plain('foo @Pat Lee - bar'), 'foo @Pat Lee - bar');
  assert.equal(plain('@Pat Lee-bar baz'), '@Pat Lee-bar baz');
  assert.equal(plain('[image]'), '');
  assert.equal(plain('  \n  [image]  \n   Spaced text here.  '), 'Spaced text here.');
  assert.equal(plain('Before [image]'), 'Before [image]');
  assert.equal(plain('[image] after'), '[image] after');
  assert.equal(plain('Hold: on hold:go now'), 'go now');
  assert.equal(plain('on holdgo'), 'on holdgo');
  assert.equal(plain('on hold :  go'), 'go');
});

test('the full hold reason names the author and the date, trims the body and cuts it at 1500 characters', () => {
  // Setup
  const body = `  ${'x'.repeat(1600)}  `;
  // Exercise
  const reason = holdReason([noteAt('long', '2026-11-01T12:00:00Z', 'sam', body)], heldTicket);
  // Verify
  assert.equal(reason.full, `sam · Nov 1\n\n${'x'.repeat(1500)}`);
  assert.equal(holdReason([noteAt('short', '2026-11-01T12:00:00Z', 'sam', '  hi there  ')], heldTicket).full, 'sam · Nov 1\n\nhi there');
});

const factRules = { statusOrder: ['on_hold', 'qa'], statusIs: (group, status) => ({ on_hold: 'On Hold', qa: 'QA' })[group] === status };
const baseTicket = { key: 'PROJ-123', status: 'QA', source: 'jira', assignee: 'Sam Ray', status_category: 'indeterminate' };

test('ticket facts carry the key, source, status group, status name and category flags', () => {
  // Setup
  const options = { myName: 'Alex Doe', rules: factRules };
  // Exercise
  const { facts, reason } = ticketFacts(baseTicket, null, options);
  // Verify
  assert.equal(facts.connector, 'jira');
  assert.equal(facts['ticket.key'], 'PROJ-123');
  assert.equal(facts['ticket.status'], 'qa');
  assert.equal(facts['ticket.status_name'], 'QA');
  assert.equal(facts['ticket.assignee'], 'Sam Ray');
  assert.equal(facts['ticket.done'], false);
  assert.equal(facts['ticket.started'], true);
  assert.equal(facts['ticket.hold_reason'], null);
  assert.equal(reason, null);
  assert.equal(facts['pr.open'], false);
  assert.equal(facts['pr.merged'], false);
  assert.equal('pr.number' in facts, false);
});

test('ticket facts fall back to the status category, and to null when there is none', () => {
  // Setup
  const options = { myName: 'Alex Doe', rules: factRules };
  // Exercise
  const done = ticketFacts({ ...baseTicket, status: 'Closed', status_category: 'done' }, null, options).facts;
  const fresh = ticketFacts({ ...baseTicket, status: 'Open', status_category: 'new' }, null, options).facts;
  const unknown = ticketFacts({ key: 'PROJ-124', status: 'Odd' }, null, options).facts;
  // Verify
  assert.equal(done['ticket.status'], 'done');
  assert.equal(done['ticket.done'], true);
  assert.equal(done['ticket.started'], false);
  assert.equal(fresh['ticket.status'], 'todo');
  assert.equal(unknown['ticket.status'], null);
  assert.equal(unknown.connector, null);
  assert.equal(unknown['ticket.assignee'], null);
});

test('the assignee reads me only when it matches my name', () => {
  // Setup
  const mine = { ...baseTicket, assignee: 'Alex Doe' };
  // Exercise
  const asMe = ticketFacts(mine, null, { myName: 'Alex Doe', rules: factRules }).facts;
  const noName = ticketFacts(mine, null, { myName: '', rules: factRules }).facts;
  const other = ticketFacts(mine, null, { myName: 'Sam Ray', rules: factRules }).facts;
  // Verify
  assert.equal(asMe['ticket.assignee'], 'me');
  assert.equal(noName['ticket.assignee'], 'Alex Doe');
  assert.equal(other['ticket.assignee'], 'Alex Doe');
});

test('an on hold ticket carries its hold reason, and a ticket in another status does not look for one', () => {
  // Setup
  const comments = [noteAt('why', '2026-11-01T12:05:00Z', 'sam', 'Waiting on legal.')];
  const held = { ...baseTicket, status: 'On Hold', status_change: { since: '2026-11-01T12:00:00Z', by: 'sam' } };
  // Exercise
  const onHold = ticketFacts(held, null, { myName: 'Alex Doe', rules: factRules, comments });
  const inQa = ticketFacts({ ...held, status: 'QA' }, null, { myName: 'Alex Doe', rules: factRules, comments });
  // Verify
  assert.equal(onHold.facts['ticket.hold_reason'], 'Waiting on legal.');
  assert.equal(onHold.reason.url, 'https://example.test/why');
  assert.equal(inQa.facts['ticket.hold_reason'], null);
  assert.equal(inQa.reason, null);
});

test('ticket facts read the PR state, number, checks, review, base, unanswered flag and commenter', () => {
  // Setup
  const options = { myName: 'Alex Doe', rules: factRules };
  const open = { state: 'OPEN', pr: 7, checks: 'passing', review: 'APPROVED', base: 'main', unanswered: 1, last_comment_by: 'pat' };
  // Exercise
  const withPr = ticketFacts(baseTicket, open, options).facts;
  const merged = ticketFacts(baseTicket, { state: 'MERGED', pr: 8 }, options).facts;
  // Verify
  assert.equal(withPr['pr.open'], true);
  assert.equal(withPr['pr.merged'], false);
  assert.equal(withPr['pr.number'], 7);
  assert.equal(withPr['pr.checks'], 'passing');
  assert.equal(withPr['pr.review'], 'approved');
  assert.equal(withPr['pr.base'], 'main');
  assert.equal(withPr['pr.unanswered'], true);
  assert.equal(withPr['pr.commenter'], 'pat');
  assert.equal(merged['pr.open'], false);
  assert.equal(merged['pr.merged'], true);
  assert.equal(merged['pr.checks'], null);
  assert.equal(merged['pr.review'], 'none');
  assert.equal(merged['pr.base'], null);
  assert.equal(merged['pr.unanswered'], false);
  assert.equal(merged['pr.commenter'], null);
});

test('ticket facts describe the newest open mention and how many there are', () => {
  // Setup
  const options = { myName: 'Alex Doe', rules: factRules };
  const mentions = [{ question: false, comment: { author: 'pat' } }, { question: true, comment: { author: 'sam' } }];
  // Exercise
  const some = ticketFacts(baseTicket, null, { ...options, mentions }).facts;
  const none = ticketFacts(baseTicket, null, options).facts;
  // Verify
  assert.equal(some['comment.mentions_me'], true);
  assert.equal(some['comment.is_question'], true);
  assert.equal(some['comment.author'], 'sam');
  assert.equal(some.unanswered_count, 2);
  assert.equal(none['comment.mentions_me'], false);
  assert.equal(none['comment.is_question'], null);
  assert.equal(none['comment.author'], null);
  assert.equal(none.unanswered_count, 0);
});

test('run facts carry the source, workflow and branch and turn flags into booleans', () => {
  // Setup
  const run = { source: 'github', failed: 1, workflow: 'ci', branch: 'main', mine: 0 };
  // Exercise
  const facts = runFacts(run);
  const bare = runFacts({ workflow: 'ci', branch: 'main' });
  // Verify
  assert.deepEqual(facts, { connector: 'github', 'run.failed': true, 'run.workflow': 'ci', 'run.branch': 'main', 'run.mine': false });
  assert.equal(bare.connector, null);
  assert.equal(bare['run.failed'], false);
});
