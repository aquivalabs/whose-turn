import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poll } from '../connectors/demo.mjs';
import { compileRules, turnRows } from '../lib/rules.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';

const stamp = (result) => Object.fromEntries(['tickets', 'comments', 'prs', 'activity', 'asks'].map((kind) => [kind, result[kind].map((item) => ({ ...item, source: 'demo' }))]));

test('the northwind scenario exercises every rule once the window has seen it', async () => {
  const result = await poll({ settings: { scenario: 'northwind' }, cache: {} });
  const rows = turnRows(stamp(result), { me: { demo: result.me }, rules: compileRules(DEFAULT_RULES), historyDays: 14, ticketUrl: (key) => `https://demo.example/browse/${key}` });
  const next = Object.fromEntries(rows.map((row) => [row.row_id, row.next]));
  assert.equal(next['NW-151'], 'Look at the failing checks');
  assert.equal(next['NW-137'], 'Address the requested changes');
  assert.equal(next['NW-142'], 'Merge it and close the ticket');
  assert.equal(next['NW-171'], 'Continue the work');
  assert.match(next['NW-104'], /^On hold: waiting for the vendor/);
  assert.equal(rows.find((row) => row.row_id === 'NW-160').group, 'gone');
  assert.equal(next['NW-151:c4'], 'Answer Pat Owner in the ticket');
  assert.equal(next['gha:n1'], 'Review PR northwind-api#512');
});

test('life arrives on the third poll: a ticket moves and a new question appears', async () => {
  const cache = {};
  await poll({ settings: { scenario: 'northwind' }, cache });
  await poll({ settings: { scenario: 'northwind' }, cache });
  const third = await poll({ settings: { scenario: 'northwind' }, cache });
  assert.equal(third.tickets.find((ticket) => ticket.key === 'NW-137').status, 'Ready for QA');
  assert.ok(third.comments.some((comment) => comment.id === 'c9'));
  await assert.rejects(poll({ settings: { scenario: 'nope' }, cache: {} }), /Unknown demo scenario/);
});
