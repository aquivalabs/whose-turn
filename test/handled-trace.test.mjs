import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
import { feedRows } from '../lib/rules.mjs';
import { passedRows, traceOf } from '../lib/trace.mjs';

const ME = 'Alex Doe';
const script = { tickets: [], prs: [] };

CONNECTORS.scripted = {
  id: 'scripted',
  label: 'Scripted',
  fields: [],
  poll: async () => ({ tickets: structuredClone(script.tickets), prs: structuredClone(script.prs), comments: [], activity: [], asks: [], runs: [], me: ME }),
};

const ticket = (status, assignee) => ({
  key: 'PROJ-1', summary: 'Fix the export', status, status_category: 'indeterminate', assignee,
  updated: new Date().toISOString(), url: 'https://tracker.example/browse/PROJ-1', status_change: null,
});

const open = async () => {
  script.tickets = [ticket('In Progress', ME)];
  script.prs = [];
  const workspace = createWorkspace(
    { id: 'trace', name: 'Trace', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ id: 'scripted', type: 'scripted' }] },
    { dataDir: mkdtempSync(join(tmpdir(), 'whose-turn-')), historyDays: 14, http: {}, notify: () => {} },
  );
  await workspace.poll();
  return workspace;
};

const rowOf = (workspace) => workspace.snapshot(false).turn.find((row) => row.row_id === 'PROJ-1');

test('reassigned and moved forward: the row lands in Handled as "Passed to <name> · <status>", linked to its feed event', async () => {
  // Setup
  const workspace = await open();
  assert.equal(rowOf(workspace).group, 'you');
  // Exercise
  script.tickets = [ticket('Ready for QA', 'Sam Tester')];
  await workspace.poll();
  // Verify
  const snapshot = workspace.snapshot(false);
  const mark = snapshot.marks.info['PROJ-1'];
  assert.equal(mark.auto, true);
  assert.equal(mark.outcome, 'Passed to Sam Tester · Ready for QA');
  assert.equal(rowOf(workspace).group, 'others');
  assert.equal(rowOf(workspace).handled, true);
  assert.ok(snapshot.feed.some((item) => item.id === mark.event && item.kind === 'reassigned'));
});

test('the turn coming back removes the auto mark', async () => {
  const workspace = await open();
  script.tickets = [ticket('Ready for QA', 'Sam Tester')];
  await workspace.poll();
  script.tickets = [ticket('In Progress', ME)];
  await workspace.poll();
  const { marks } = workspace.snapshot(false);
  assert.equal(marks.info['PROJ-1'], undefined);
  assert.equal(marks.handled['PROJ-1'], undefined);
  assert.equal(rowOf(workspace).group, 'you');
});

test('a note rides with a Handled mark, shows in the feed as your own event, and goes with Undo', async () => {
  const workspace = await open();
  workspace.updateMarks({ handled: { 'PROJ-1': new Date().toISOString() }, notes: { 'PROJ-1': '  Checked with the customer, nothing to change\n' } });
  const noted = workspace.snapshot(false);
  assert.equal(noted.marks.info['PROJ-1'].note, 'Checked with the customer, nothing to change');
  const event = noted.feed.find((item) => item.kind === 'note');
  assert.equal(event.who, 'you');
  assert.equal(event.key, 'PROJ-1');
  assert.equal(event.text, 'Checked with the customer, nothing to change');
  workspace.updateMarks({ handled: { 'PROJ-1': null } });
  const undone = workspace.snapshot(false);
  assert.equal(undone.marks.info['PROJ-1'], undefined);
  assert.equal(undone.feed.some((item) => item.kind === 'note'), false);
});

test('a note for a row that is not handled is dropped', async () => {
  const workspace = await open();
  workspace.updateMarks({ notes: { 'PROJ-1': 'stray' } });
  assert.deepEqual(workspace.snapshot(false).marks.info, {});
});

const pair = (afterFields = {}) => ({
  before: { row_id: 'K-1', key: 'K-1', group: 'you', pr_state: 'OPEN' },
  after: { row_id: 'K-1', key: 'K-1', source: 's', group: 'others', pr_state: 'OPEN', ...afterFields },
});

test('merged beats the ticket events and links the merge in the feed', () => {
  const feed = [{ id: 'act:pr:1', kind: 'merged', key: 'K-1' }];
  const events = [{ key: 'K-1', source: 's', at: 'x', kind: 'status', text: 'Code Review → Done' }];
  assert.deepEqual(traceOf(pair({ pr_state: 'MERGED' }), events, feed), { outcome: 'Merged', event: 'act:pr:1', detail: { summary: 'Pull request merged' } });
});

test('a status move on its own reads "Moved to <status>" and a reassignment on its own "Passed to <name>"', () => {
  const status = { key: 'K-1', source: 's', at: 't1', kind: 'status', text: 'Code Review → Ready for QA' };
  const reassigned = { key: 'K-1', source: 's', at: 't2', kind: 'reassigned', text: 'Alex Doe → Sam Tester' };
  assert.deepEqual(traceOf(pair(), [status], []), { outcome: 'Moved to Ready for QA', event: 'event:K-1:t1:status', detail: { status: 'Code Review → Ready for QA' } });
  assert.deepEqual(traceOf(pair(), [reassigned], []), { outcome: 'Passed to Sam Tester', event: 'event:K-1:t2:reassigned', detail: { what: 'Passed to Sam Tester', assignee: 'Alex Doe → Sam Tester' } });
});

test('without a cause among the events there is no trace', () => {
  assert.equal(traceOf(pair(), [], []), null);
  assert.equal(traceOf(pair(), [{ key: 'OTHER-1', source: 's', at: 'x', kind: 'status', text: 'a → b' }], []), null);
});

test('only ticket rows that moved from you to others count as passed', () => {
  const before = [
    { row_id: 'K-1', key: 'K-1', group: 'you' },
    { row_id: 'K-2:c1', key: 'K-2', group: 'you' },
    { row_id: 'K-3', key: 'K-3', group: 'you' },
  ];
  const after = [
    { row_id: 'K-1', key: 'K-1', group: 'others' },
    { row_id: 'K-2:c1', key: 'K-2', group: 'others' },
    { row_id: 'K-3', key: 'K-3', group: 'done' },
  ];
  assert.deepEqual(passedRows(before, after).map((item) => item.after.row_id), ['K-1']);
});

test('a comment from the day before the move joins the outcome and the detail', () => {
  const now = Date.now();
  const reassigned = { key: 'K-1', source: 's', at: new Date(now).toISOString(), kind: 'reassigned', text: 'Alex Doe → Sam Tester' };
  const status = { key: 'K-1', source: 's', at: new Date(now).toISOString(), kind: 'status', text: 'Code Review → Ready for QA' };
  const fresh = { kind: 'comment', key: 'K-1', at: new Date(now - 3600000).toISOString(), who: 'Alex Doe', body: 'Ready,\n  please test the export' };
  const stale = { kind: 'comment', key: 'K-1', at: new Date(now - 3 * 86400000).toISOString(), who: 'Alex Doe', body: 'Old news' };
  const trace = traceOf(pair(), [reassigned, status], [fresh]);
  assert.equal(trace.outcome, 'Passed to Sam Tester · Ready for QA · Ready, please test the export');
  assert.equal(trace.detail.what, 'Passed to Sam Tester · Ready for QA');
  assert.deepEqual(trace.detail.comment, { author: 'Alex Doe', text: 'Ready, please test the export' });
  assert.equal(traceOf(pair(), [reassigned, status], [stale]).outcome, 'Passed to Sam Tester · Ready for QA');
});

test('a note on a handled row can be edited later and cleared with an empty line', async () => {
  const workspace = await open();
  workspace.updateMarks({ handled: { 'PROJ-1': new Date().toISOString() } });
  workspace.updateMarks({ notes: { 'PROJ-1': 'first' } });
  workspace.updateMarks({ notes: { 'PROJ-1': 'second' } });
  assert.equal(workspace.snapshot(false).marks.info['PROJ-1'].note, 'second');
  workspace.updateMarks({ notes: { 'PROJ-1': '' } });
  assert.equal(workspace.snapshot(false).marks.info['PROJ-1']?.note, undefined);
});

test('the detail shows your own name as "you" and keeps a long comment whole', () => {
  const at = new Date().toISOString();
  const reassigned = { key: 'K-1', source: 's', at, kind: 'reassigned', text: 'Alex Doe → Sam Tester' };
  const long = 'word '.repeat(300).trim();
  const feed = [{ kind: 'comment', key: 'K-1', at, who: 'you', body: long }, ...feedRows({ events: [reassigned] }, { me: { s: 'Alex Doe' }, rules: {} })];
  const trace = traceOf(pair(), [reassigned], feed);
  assert.equal(trace.detail.assignee, 'you → Sam Tester');
  assert.equal(trace.detail.comment.text, long);
});
