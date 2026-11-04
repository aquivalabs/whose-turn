import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, applyPlan, parseArgs, planRelease, readReady } from '../scripts/release-linear.mjs';

const issue = (n, labels = []) => ({ id: `id-${n}`, identifier: `RMA-${n}`, title: `Issue ${n}`, labels: { nodes: labels.map((name) => ({ name })) } });

test('the plan moves every issue to Done and comments only on a user report', () => {
  const plan = planRelease({ issues: [issue(1, ['User report', 'Bug']), issue(2, ['Bug']), issue(3)], doneStateId: 'done-id', version: '1.0.0-alpha.9' });
  assert.deepEqual(
    plan.moves.map((move) => [move.identifier, move.stateId, move.comment]),
    [
      ['RMA-1', 'done-id', 'Shipped in 1.0.0-alpha.9.'],
      ['RMA-2', 'done-id', null],
      ['RMA-3', 'done-id', null],
    ],
  );
});

test('an empty Ready for release plans nothing', () => {
  assert.deepEqual(planRelease({ issues: [], doneStateId: 'd', version: '1.0.0' }).moves, []);
});

const stubLinear = (pages) => {
  const sent = [];
  const call = async (query, variables) => {
    sent.push({ query, variables });
    if (query.includes('query Ready')) {
      const page = pages[variables.after ? 1 : 0];
      return {
        teams: { nodes: [{ states: { nodes: [{ id: 'x', name: 'Done early', type: 'started' }, { id: 'done-id', name: 'Done', type: 'completed' }] } }] },
        issues: page,
      };
    }
    return {};
  };
  return { call, sent };
};

test('reading follows the pages and finds the Done state by name and type', async () => {
  const { call, sent } = stubLinear([
    { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [issue(1)] },
    { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [issue(2)] },
  ]);
  const { issues, doneStateId } = await readReady(call);
  assert.deepEqual(issues.map((entry) => entry.identifier), ['RMA-1', 'RMA-2']);
  assert.equal(doneStateId, 'done-id');
  assert.deepEqual(sent.map((entry) => entry.variables.after), [null, 'c1']);
  assert.equal(sent[0].variables.ready, 'Ready for release');
  assert.equal(sent[0].variables.project, 'whose-turn');
});

test('a team without a Done state is an error, not a guess', async () => {
  const call = async () => ({ teams: { nodes: [{ states: { nodes: [] } }] }, issues: { pageInfo: { hasNextPage: false }, nodes: [] } });
  await assert.rejects(readReady(call), /no completed state named Done/);
});

test('applying comments before it moves, in plan order', async () => {
  const plan = planRelease({ issues: [issue(1, ['User report']), issue(2)], doneStateId: 'done-id', version: '2.0.0' });
  const sent = [];
  await applyPlan(async (query, variables) => { sent.push([query.split('(')[0].trim(), variables]); return {}; }, plan);
  assert.deepEqual(sent, [
    ['mutation Comment', { id: 'id-1', body: 'Shipped in 2.0.0.' }],
    ['mutation Move', { id: 'id-1', state: 'done-id' }],
    ['mutation Move', { id: 'id-2', state: 'done-id' }],
  ]);
});

test('a failed comment leaves the issue where it was', async () => {
  const plan = planRelease({ issues: [issue(1, ['User report'])], doneStateId: 'done-id', version: '2.0.0' });
  const sent = [];
  const call = async (query) => { sent.push(query); throw new Error('boom'); };
  await assert.rejects(applyPlan(call, plan), /boom/);
  assert.equal(sent.length, 1);
});

test('dry-run is the default, and --version overrides', () => {
  assert.deepEqual(parseArgs([]), { apply: false, version: undefined });
  assert.deepEqual(parseArgs(['--apply', '--version', '1.2.3']), { apply: true, version: '1.2.3' });
});

test('team, project and the secret-store entry are flags with today\'s values as defaults', async () => {
  assert.deepEqual(DEFAULTS, { team: 'RMA', project: 'whose-turn', keychainService: 'linear-api-key-write', keychainAccount: 'roman' });
  assert.deepEqual(parseArgs(['--team', 'ABC', '--project', 'other', '--keychain-service', 's', '--keychain-account', 'a']), {
    apply: false, version: undefined, team: 'ABC', project: 'other', keychainService: 's', keychainAccount: 'a',
  });
  const { call, sent } = stubLinear([{ pageInfo: { hasNextPage: false }, nodes: [] }]);
  await readReady(call, { team: 'ABC', project: 'other' });
  assert.equal(sent[0].variables.team, 'ABC');
  assert.equal(sent[0].variables.project, 'other');
});
