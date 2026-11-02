import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeedback } from '../lib/feedback.mjs';

const settings = { workspace: 'your-space', team: 'PROJ', project: 'monitor' };
const secrets = { get: async (service, account) => (service === 'whose-turn-feedback' && account === 'your-space' ? 'lin_api_write' : '') };
const stub = () => {
  const calls = [];
  const http = { fetchJson: async (url, options) => {
    calls.push(options.body);
    if (options.body.query.includes('query Lookup')) {
      return { data: { teams: { nodes: [{ id: 't1', key: 'PROJ', labels: { nodes: [{ id: 'l-bug', name: 'Bug' }, { id: 'l-imp', name: 'Improvement' }] } }] }, projects: { nodes: [{ id: 'p1', name: 'monitor' }] } } };
    }
    return { data: { issueCreate: { success: true, issue: { id: 'i1', identifier: 'PROJ-500', url: 'https://linear.app/your-space/issue/PROJ-500', title: options.body.variables.input.title } } } };
  } };
  return { http, calls };
};

test('a bug goes to the configured team and project with the Bug label, the body and the context in the description', async () => {
  const { http, calls } = stub();
  const cache = {};
  const issue = await createFeedback({ settings, secrets, http, cache }, { kind: 'bug', title: 'The chevron wraps', body: 'On a narrow feed the chevron drops a line.', context: { ws: 'demo' }, from: 'the window' });
  assert.equal(issue.identifier, 'PROJ-500');
  const input = calls[1].variables.input;
  assert.equal(input.teamId, 't1');
  assert.equal(input.projectId, 'p1');
  assert.deepEqual(input.labelIds, ['l-bug']);
  assert.match(input.description, /drops a line/);
  assert.match(input.description, /"ws": "demo"/);
  await createFeedback({ settings, secrets, http, cache }, { kind: 'improvement', title: 'Second' });
  assert.equal(calls.length, 3);
});

test('no title, no config or no key each refuse with a plain message', async () => {
  const { http } = stub();
  await assert.rejects(createFeedback({ settings, secrets, http, cache: {} }, { title: '  ' }), /title is required/);
  await assert.rejects(createFeedback({ settings: null, secrets, http, cache: {} }, { title: 'x' }), /not configured/);
  await assert.rejects(createFeedback({ settings: { ...settings, workspace: 'elsewhere' }, secrets, http, cache: {} }, { title: 'x' }), /No Linear key for feedback/);
});
