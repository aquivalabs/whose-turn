import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRules, feedRows, turnRows } from '../lib/rules.mjs';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { ticket } from './fixtures/rules.mjs';

const me = { jira: 'Alex Doe' };
const rules = compileRules(DEFAULT_RULES);

test('a row waiting on the user shows "you", not the full name', () => {
  const rows = turnRows({ tickets: [ticket({ assignee: 'Alex Doe', status: 'On Hold' })] }, { me, rules, historyDays: 3650 });
  assert.ok(rows.every((row) => row.whose !== 'Alex Doe'));
});

test('another assignee keeps their name', () => {
  const rows = turnRows({ tickets: [ticket({ assignee: 'Sam Roe', status: 'In Progress' })] }, { me, rules, historyDays: 3650 });
  assert.equal(rows.find((row) => row.row_id === 'PROJ-1').whose, 'Sam Roe');
});

test('feed items name the user "you"', () => {
  const feed = feedRows({
    tickets: [ticket({ assignee: 'Alex Doe', status: 'In Progress' })],
    activity: [{ source: 'jira', at: '2026-11-02T10:00:00Z', url: 'https://x.test/a', kind: 'comment', who: 'Alex Doe', text: 'hi' }],
  }, { me, rules, historyDays: 3650 });
  assert.ok(feed.every((item) => !JSON.stringify(item).includes('Alex Doe')));
  assert.ok(feed.some((item) => item.text === 'now In Progress, with you'));
});
