import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRules, turnRows, feedRows, myMoves, holdReason } from '../lib/rules.mjs';
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
  assert.equal(row.next, 'Review PR other-repo#12');
});

test('a handled mark hides a row until something newer happens on it', () => {
  const list = rows({ tickets: [ticket()], prs: [pr({ checks: 'failing', updated_at: '2026-11-01T11:00:00Z' })] });
  assert.equal(myMoves(list, { handled: { 'PROJ-1': '2026-11-01T12:00:00Z' } }).length, 0);
  assert.equal(myMoves(list, { handled: { 'PROJ-1': '2026-11-01T10:00:00Z' } }).length, 1);
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
