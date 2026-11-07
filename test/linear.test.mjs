import { test } from 'node:test';
import assert from 'node:assert/strict';
import linear, { normalise } from '../connectors/linear.mjs';

const viewer = { id: 'u1', name: 'alex', displayName: 'Alex Doe' };
const issue = (overrides = {}) => ({
  id: 'i1', identifier: 'PROJ-7', title: 'Offline queue', url: 'https://linear.app/your-space/issue/PROJ-7/offline-queue', updatedAt: '2026-11-01T10:00:00.000Z', completedAt: null,
  state: { name: 'In Review', type: 'started' }, assignee: { id: 'u1', name: 'alex', displayName: 'Alex Doe' },
  comments: { nodes: [{ id: 'c1', body: 'Looks good, [@Alex Doe](https://linear.app/your-space/profiles/alex) can you add a test?', createdAt: '2026-11-01T11:00:00.000Z', url: 'https://linear.app/your-space/issue/PROJ-7#comment-c1', user: { id: 'u2', name: 'sam', displayName: 'Sam Lead' } }] },
  history: { nodes: [{ createdAt: '2026-10-30T09:00:00.000Z', toState: { name: 'In Progress' }, actor: { displayName: 'Alex Doe' } }, { createdAt: '2026-10-31T09:00:00.000Z', toState: { name: 'In Review' }, actor: { displayName: 'Alex Doe' } }] },
  ...overrides,
});

test('issues become tickets with a status category, the moment they entered their state, and comments with plain @mentions', () => {
  const result = normalise([issue(), issue({ id: 'i2', identifier: 'PROJ-9', state: { name: 'Done', type: 'completed' }, completedAt: '2026-11-01T12:00:00.000Z' })], viewer);
  assert.equal(result.me, 'Alex Doe');
  assert.equal(result.tickets[0].status_category, 'indeterminate');
  assert.deepEqual(result.tickets[0].status_change, { since: '2026-10-31T09:00:00Z', by: 'Alex Doe' });
  assert.equal(result.tickets[1].status_category, 'done');
  assert.equal(result.tickets[1].status_change, null);
  assert.equal(result.comments[0].body, 'Looks good, @Alex Doe can you add a test?');
  assert.equal(result.ticket_base, 'https://linear.app/your-space/issue/');
});

test('poll asks the API for open and recently completed issues of me, with the key as the Authorization header', async () => {
  const calls = [];
  const http = { fetchJson: async (url, options) => { calls.push({ url, auth: options.headers.Authorization, filter: options.body.variables.filter }); return { data: { viewer, issues: { pageInfo: { hasNextPage: false }, nodes: [issue()] } } }; } };
  const secrets = { get: async (service, account) => (service === 'whose-turn-linear' && account === 'your-space' ? 'lin_api_test' : '') };
  const result = await linear.poll({ settings: { workspace: 'your-space', team: 'PROJ' }, http, secrets, cache: {} });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url === 'https://api.linear.app/graphql' && call.auth === 'lin_api_test'));
  assert.deepEqual(calls[0].filter.team, { key: { eq: 'PROJ' } });
  assert.ok(calls[1].filter.completedAt.gte);
  assert.equal(result.tickets.length, 1);
  await assert.rejects(linear.poll({ settings: { workspace: 'other' }, http, secrets, cache: {} }), /No Linear API key/);
});

test('poll reads archived issues for Recently done, and only active ones for the open list', async () => {
  const calls = [];
  const http = { fetchJson: async (url, options) => { calls.push(options.body); return { data: { viewer, issues: { pageInfo: { hasNextPage: false }, nodes: [] } } }; } };
  const secrets = { get: async () => 'lin_api_test' };
  await linear.poll({ settings: { workspace: 'your-space' }, http, secrets, cache: {} });
  const done = calls.find((body) => body.variables.filter.completedAt);
  const open = calls.find((body) => !body.variables.filter.completedAt);
  assert.equal(done.variables.archived, true);
  assert.equal(open.variables.archived, false);
  assert.match(done.query, /includeArchived: \$archived/);
});

test('a Duplicate issue is closed: the open list leaves it out and a stray one counts as done', async () => {
  const calls = [];
  const http = { fetchJson: async (url, options) => { calls.push(options.body.variables.filter); return { data: { viewer, issues: { pageInfo: { hasNextPage: false }, nodes: [] } } }; } };
  await linear.poll({ settings: { workspace: 'your-space' }, http, secrets: { get: async () => 'lin_api_test' }, cache: {} });
  const open = calls.find((filter) => !filter.completedAt);
  assert.deepEqual(open.state.type.nin, ['completed', 'canceled', 'duplicate']);
  const { tickets } = normalise([issue({ state: { name: 'Duplicate', type: 'duplicate' } })], viewer);
  assert.equal(tickets[0].status_category, 'done');
});
