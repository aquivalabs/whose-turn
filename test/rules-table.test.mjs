import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRules, turnRows } from '../lib/rules.mjs';
import { DEFAULT_RULES, normaliseWorkspaces } from '../lib/config.mjs';
import { startApi } from '../lib/api.mjs';
import { ticket, pr, comment } from './fixtures/rules.mjs';

const me = { jira: 'Alex Doe', github: 'alex' };
const ticketRow = (state, table) => {
  const rules = compileRules({ ...DEFAULT_RULES, table });
  return turnRows(state, { me, rules, historyDays: 3650 }).find((row) => row.row_id === 'PROJ-1');
};
const yours = (next) => ({ whose: 'you', next });

test('an equality condition matches the fact value, and a condition on a missing fact never matches', () => {
  const table = [{ when: { 'pr.checks': 'running' }, then: yours('Wait for the checks') }, { when: {}, then: { whose: 'them', next: 'Fallback' } }];
  assert.equal(ticketRow({ tickets: [ticket()], prs: [pr({ checks: 'running' })] }, table).next, 'Wait for the checks');
  assert.equal(ticketRow({ tickets: [ticket()] }, table).next, 'Fallback');
});

test('a list condition matches any of its values', () => {
  const table = [{ when: { 'ticket.status': ['qa', 'on_hold'] }, then: yours('Chase it') }];
  assert.equal(ticketRow({ tickets: [ticket({ status: 'Blocked' })] }, table).next, 'Chase it');
  assert.equal(ticketRow({ tickets: [ticket({ status: 'In QA' })] }, table).next, 'Chase it');
  assert.equal(ticketRow({ tickets: [ticket({ status: 'In Progress' })] }, table).next, 'Not yours now');
});

test('number comparisons hold together on one fact', () => {
  const table = [{ when: { unanswered_count: { gte: 2, lt: 4 } }, then: yours('Several people wait on you') }];
  const asked = (count) => ({ tickets: [ticket()], comments: Array.from({ length: count }, (unused, index) => comment({ id: `c${index}`, author: `Person ${index}` })) });
  assert.equal(ticketRow(asked(1), table).next, 'Not yours now');
  assert.equal(ticketRow(asked(2), table).next, 'Several people wait on you');
  assert.equal(ticketRow(asked(4), table).next, 'Not yours now');
  assert.equal(ticketRow(asked(2), [{ when: { unanswered_count: { gt: 2 } }, then: yours('x') }]).next, 'Not yours now');
  assert.equal(ticketRow(asked(2), [{ when: { unanswered_count: { lte: 2 } }, then: yours('x') }]).next, 'x');
});

test('a prefix condition matches the start of a text fact', () => {
  const table = [{ when: { 'pr.base': { prefix: 'hotfix/' } }, then: yours('Ship the hotfix') }];
  assert.equal(ticketRow({ tickets: [ticket()], prs: [pr({ base: 'hotfix/1.2' })] }, table).next, 'Ship the hotfix');
  assert.equal(ticketRow({ tickets: [ticket()], prs: [pr({ base: 'main' })] }, table).next, 'Not yours now');
});

test('present tests whether a fact is there; false is the one condition a missing fact matches', () => {
  const table = [
    { when: { 'pr.commenter': { present: true } }, then: yours('Answer {pr.commenter}') },
    { when: { 'pr.commenter': { present: false } }, then: yours('Nobody commented') },
  ];
  assert.equal(ticketRow({ tickets: [ticket()], prs: [pr({ unanswered: true, last_comment_by: 'sam' })] }, table).next, 'Answer sam');
  assert.equal(ticketRow({ tickets: [ticket()] }, table).next, 'Nobody commented');
});

test('then.started and then.hold are declared effects of the row, not read off its conditions', () => {
  const started = ticketRow({ tickets: [ticket()] }, [{ when: {}, then: { ...yours('Go on'), started: true } }]);
  assert.equal(started.started, true);
  assert.equal(ticketRow({ tickets: [ticket()] }, [{ when: {}, then: yours('Go on') }]).started, false);
  const problems = normaliseWorkspaces([{ id: 'w', connectors: {}, rules: { table: [{ when: {}, then: { ...yours('x'), hold: 'yes' } }] } }]).problems;
  assert.ok(problems.some((problem) => problem.includes('"then.hold" must be true or false')), problems.join('\n'));
});

test('the first matching row wins', () => {
  const table = [{ when: { 'pr.open': true }, then: yours('First') }, { when: { 'pr.open': true, 'pr.checks': 'passing' }, then: yours('Second') }];
  assert.equal(ticketRow({ tickets: [ticket()], prs: [pr()] }, table).next, 'First');
});

test('hidden drops the row from your move and from waiting', () => {
  const row = ticketRow({ tickets: [ticket({ assignee: 'Someone Else' })] }, [{ when: { connector: 'jira' }, then: { whose: 'hidden' } }]);
  assert.equal(row.group, 'gone');
});

test('a workspace table replaces the default, and the default marker puts the default rows where it stands', () => {
  const failing = { tickets: [ticket()], prs: [pr({ checks: 'failing' })] };
  assert.equal(ticketRow(failing, [{ when: {}, then: { whose: 'qa', next: 'Ours only' } }]).next, 'Ours only');
  assert.equal(ticketRow(failing, [{ when: {}, then: { whose: 'qa', next: 'Ours only' } }]).whose, 'QA');
  assert.equal(ticketRow(failing, [{ when: { connector: 'nope' }, then: yours('Before') }, 'default']).next, 'Look at the failing checks');
  assert.equal(ticketRow(failing, [{ when: { connector: 'jira' }, then: yours('Before') }, 'default']).next, 'Before');
});

test('placeholders are filled from the facts', () => {
  const table = [{ when: { 'comment.mentions_me': true }, then: { whose: 'you', next: 'Answer {comment.author} in the ticket', why: '{unanswered_count} open on {ticket.key}, PR #{pr.number} into {pr.base}' } }];
  const row = ticketRow({ tickets: [ticket()], prs: [pr()], comments: [comment()] }, table);
  assert.equal(row.next, 'Answer Sam Reviewer in the ticket');
  assert.equal(row.why, '1 open on PROJ-1, PR #7 into main');
});

test('a bad table is refused with the row and the unknown fact or operator named', () => {
  const { problems } = normaliseWorkspaces([{ id: 'w', rules: { table: [
    { when: { 'pr.open': true }, then: yours('Fine') },
    { when: { 'pr.colour': 'red' }, then: yours('x') },
    { when: { 'pr.base': { matches: 'release' } }, then: yours('x') },
    { when: { 'ticket.status': 'shipped' }, then: { whose: 'boss', next: 'Ask {pr.author}' } },
  ] } }]);
  assert.deepEqual(problems, [
    'Workspace "w": rules.table row 2: unknown fact "pr.colour"; GET /api/config lists the facts; the table is ignored.',
    'Workspace "w": rules.table row 3: unknown operator "matches" on "pr.base"; use gt, gte, lt, lte, prefix or present; the table is ignored.',
    'Workspace "w": rules.table row 4: "ticket.status" is one of backlog, passed, code_review, qa, on_hold, todo, in_progress, done, got "shipped"; the table is ignored.',
    'Workspace "w": rules.table row 4: "then.whose" is one of you, reviewer, qa, them, hidden, got "boss"; the table is ignored.',
    'Workspace "w": rules.table row 4: unknown fact "{pr.author}" in the text; the table is ignored.',
  ]);
});

test('POST /api/config refuses a bad table through the config validation and saves nothing', async () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  let saved = false;
  const registry = { workspaces: [], rawWorkspaces: [], problems: [], subscribe: () => () => {} };
  const server = await startApi({ port, appDir: new URL('..', import.meta.url).pathname, registry, requestPoll: () => {}, saveConfig: async () => { saved = true; }, secrets: {}, inbox: {}, http: {}, reports: {} });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaces: [{ id: 'w', rules: { table: [{ when: { 'pr.checks': { gt: 1 } }, then: yours('x') }] } }] }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.details[0].reason, 'INVALID_CONFIG');
    assert.match(body.error.details[1].field_violations[0].description, /rules\.table row 1: "gt" needs a number fact/);
    assert.equal(saved, false);
  } finally {
    server.close();
  }
});

const postConfig = async (workspaces) => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const registry = { workspaces: [], rawWorkspaces: [], problems: [], subscribe: () => () => {} };
  const server = await startApi({ port, appDir: new URL('..', import.meta.url).pathname, registry, requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: {} });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaces }) });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
};

test('POST /api/config refuses a null or non-object workspace as INVALID_CONFIG naming the index', async () => {
  for (const [workspaces, field] of [[[null], 'workspaces[0]'], [[{ id: 'a' }, 'x'], 'workspaces[1]']]) {
    const { status, body } = await postConfig(workspaces);
    assert.equal(status, 400);
    assert.equal(body.error.details[0].reason, 'INVALID_CONFIG');
    assert.equal(body.error.details[1].field_violations[0].field, field);
  }
});

test('POST /api/config refuses a non-object connector as INVALID_CONFIG naming workspace and connector index', async () => {
  const { status, body } = await postConfig([{ id: 'a' }, { id: 'b', connectors: [{ type: 'demo' }, null] }]);
  assert.equal(status, 400);
  assert.equal(body.error.details[0].reason, 'INVALID_CONFIG');
  assert.equal(body.error.details[1].field_violations[0].field, 'workspaces[1].connectors[1]');
});
