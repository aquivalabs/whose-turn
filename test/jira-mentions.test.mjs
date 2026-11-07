import { test } from 'node:test';
import assert from 'node:assert/strict';
import jira, { mentionsJql } from '../connectors/jira.mjs';

const issue = (key, assignee) => ({ key, fields: { summary: `${key} summary`, status: { name: 'To Do', statusCategory: { key: 'new' } }, assignee: assignee ? { displayName: assignee } : null, updated: '2026-11-06T10:00:00.000+0000', comment: { comments: [] } } });

const fakeJira = ({ held = [], mentioned = [] } = {}) => {
  const queries = [];
  const http = {
    fetchJson: async (url, options = {}) => {
      const { pathname } = new URL(url);
      if (pathname === '/rest/api/3/myself') {
        return { accountId: '5b10:abc-123', displayName: 'Alex Doe' };
      }
      if (pathname === '/rest/api/3/search/jql') {
        queries.push(options.body.jql);
        return { issues: options.body.jql.startsWith('comment ~') ? mentioned : held };
      }
      return { values: [] };
    },
  };
  return { http, queries };
};

const pollWith = (http, settings = {}) => jira.poll({ settings: { base: 'https://your-site.atlassian.net', email: 'alex@example.com', ...settings }, http, secrets: { get: async () => 'token' }, cache: {}, historyDays: 14 });

test('a second query finds tickets that mention your account id; those the main query missed are marked mention-only (RMA-86)', async () => {
  // Setup
  const { http, queries } = fakeJira({ held: [issue('PROJ-1', 'Alex Doe')], mentioned: [issue('PROJ-1', 'Alex Doe'), issue('PROJ-2', 'Sam Reviewer'), issue('PROJ-3', null)] });
  // Exercise
  const result = await pollWith(http);
  // Verify
  assert.equal(queries[1], 'comment ~ "5b10:abc-123" AND updated >= -14d ORDER BY updated DESC');
  assert.deepEqual(result.tickets.map((ticket) => [ticket.key, Boolean(ticket.mention_only)]), [['PROJ-1', false], ['PROJ-2', true], ['PROJ-3', true]]);
});

test('mentions set to false skips the second query, and an account id that is not plain is never put into JQL', async () => {
  // Setup
  const { http, queries } = fakeJira({ held: [issue('PROJ-1', 'Alex Doe')] });
  // Exercise
  await pollWith(http, { mentions: false });
  // Verify
  assert.equal(queries.length, 1);
  assert.equal(mentionsJql('x" OR project = SECRET OR "', 14), '');
});

test('a failed mention query keeps the main tickets and names the part that failed', async () => {
  // Setup
  const http = {
    fetchJson: async (url, options = {}) => {
      if (new URL(url).pathname === '/rest/api/3/myself') {
        return { accountId: 'abc', displayName: 'Alex Doe' };
      }
      if (options.body?.jql?.startsWith('comment ~')) {
        throw new Error('HTTP 400');
      }
      return { issues: [issue('PROJ-1', 'Alex Doe')] };
    },
  };
  // Exercise
  const result = await pollWith(http);
  // Verify
  assert.deepEqual(result.tickets.map((ticket) => ticket.key), ['PROJ-1']);
  assert.match(result.errors.mentions, /HTTP 400/);
});
