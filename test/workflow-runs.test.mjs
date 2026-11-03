import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as github from '../connectors/github.mjs';
import { compileRules, turnRows, feedRows } from '../lib/rules.mjs';
import { DEFAULT_RULES, normaliseWorkspaces } from '../lib/config.mjs';
import { connectorCatalogue } from '../connectors/index.mjs';

const SINCE = '2026-10-01T00:00:00Z';
const workflowRun = (overrides = {}) => ({
  id: 1, name: 'scout-publish', workflow_id: 11, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'failure', pull_requests: [],
  created_at: '2026-11-03T09:00:00Z', updated_at: '2026-11-03T09:05:00Z', html_url: 'https://github.com/acme/app/actions/runs/1', display_title: 'Merge the export button',
  actor: { login: 'pat' }, triggering_actor: { login: 'pat' }, ...overrides,
});
const prRun = workflowRun({ id: 2, head_branch: 'feature/export', event: 'pull_request', pull_requests: [{ number: 7 }], html_url: 'https://github.com/acme/app/actions/runs/2' });

const stubbed = (runs) => {
  const requested = [];
  const responses = {
    '/search/issues': { items: [] },
    '/notifications': [],
    '/repos/acme/app': { default_branch: 'main' },
    '/repos/acme/app/actions/runs': () => ({ workflow_runs: runs() }),
  };
  const http = {
    fetchJson: async (url) => {
      const path = new URL(url).pathname;
      requested.push(path);
      const response = responses[path];
      return typeof response === 'function' ? response() : response;
    },
  };
  return { http, requested };
};

const pollOnce = (http, cache, settings = {}) => github.poll({ settings: { repo: 'acme/app', me: 'pat', ...settings }, http, cache, sinceIso: SINCE, keyOf: () => '' });
const stamp = (result) => ({ runs: result.runs.map((run) => ({ ...run, source: 'gh' })), activity: result.activity.map((item) => ({ ...item, source: 'gh' })) });
const context = { me: { gh: 'pat' }, rules: compileRules(DEFAULT_RULES), historyDays: 3650 };

test('a failed run on the default branch is returned with one list call, and a run on a PR branch is left to the PR path', async () => {
  const { http, requested } = stubbed(() => [workflowRun(), prRun]);
  const result = await pollOnce(http, { token: 't', tokenAt: Date.now() });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.runs.map((run) => [run.ref, run.workflow, run.branch, run.mine, run.url]), [['app:scout-publish@main', 'scout-publish', 'main', true, 'https://github.com/acme/app/actions/runs/1']]);
  assert.deepEqual(result.activity.map((item) => [item.kind, item.who, item.text, item.url]), [['check failed', 'scout-publish', 'scout-publish on main', 'https://github.com/acme/app/actions/runs/1']]);
  assert.equal(requested.filter((path) => path.endsWith('/actions/runs')).length, 1);
});

test('my failed run is a Your move row at rank 0 and a check failed feed item; someone else\'s stays in the feed only', async () => {
  const { http } = stubbed(() => [workflowRun()]);
  const state = stamp(await pollOnce(http, { token: 't', tokenAt: Date.now() }));
  const [row] = turnRows(state, context);
  assert.equal(row.group, 'you');
  assert.equal(row.next, 'Look at the failed run of scout-publish on main');
  assert.equal(row.rank, 0);
  assert.equal(row.key, 'app:scout-publish@main');
  assert.equal(row.url, 'https://github.com/acme/app/actions/runs/1');
  const [item] = feedRows(state, context);
  assert.deepEqual([item.kind, item.ref, item.who, item.url], ['check failed', 'app:scout-publish@main', 'scout-publish', 'https://github.com/acme/app/actions/runs/1']);
  const others = stamp(await pollOnce(stubbed(() => [workflowRun({ actor: { login: 'sam' }, triggering_actor: { login: 'sam' } })]).http, { token: 't', tokenAt: Date.now() }));
  assert.equal(turnRows(others, context)[0].group, 'gone');
  assert.equal(feedRows(others, context)[0].kind, 'check failed');
});

test('a later success clears the row and adds check passed; a new failure after it is a new move', async () => {
  let runs = [workflowRun()];
  const { http } = stubbed(() => runs);
  const cache = { token: 't', tokenAt: Date.now() };
  const first = turnRows(stamp(await pollOnce(http, cache)), context)[0].row_id;
  const success = workflowRun({ id: 3, conclusion: 'success', created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:04:00Z', html_url: 'https://github.com/acme/app/actions/runs/3' });
  runs = [success, workflowRun()];
  const fixed = await pollOnce(http, cache);
  assert.deepEqual(fixed.runs, []);
  assert.deepEqual(turnRows(stamp(fixed), context), []);
  assert.deepEqual(feedRows(stamp(fixed), context).map((item) => item.kind), ['check passed', 'check failed']);
  runs = [workflowRun({ id: 4, created_at: '2026-11-03T11:00:00Z', updated_at: '2026-11-03T11:05:00Z' }), success, workflowRun()];
  const again = turnRows(stamp(await pollOnce(http, cache)), context)[0].row_id;
  assert.notEqual(again, first);
});

test('workflow_runs: false turns the runs off, and a value that is not a boolean is refused', async () => {
  const { http, requested } = stubbed(() => [workflowRun()]);
  const result = await pollOnce(http, { token: 't', tokenAt: Date.now() }, { workflow_runs: false });
  assert.deepEqual(result.runs, []);
  assert.ok(!requested.some((path) => path.endsWith('/actions/runs')));
  const problems = (value) => normaliseWorkspaces([{ id: 'w', connectors: { github: { repo: 'acme/app', workflow_runs: value } } }]).problems;
  assert.deepEqual(problems(false), []);
  assert.ok(problems('no').some((problem) => problem.includes('workflow_runs must be true or false')), problems('no').join('\n'));
});

test('the connector catalogue declares workflow_runs as a boolean that is on by default', () => {
  const github = connectorCatalogue().find((connector) => connector.type === 'github');
  const field = github.fields.find((candidate) => candidate.key === 'workflow_runs');
  assert.equal(field.boolean, true);
  assert.equal(field.default, true);
});
