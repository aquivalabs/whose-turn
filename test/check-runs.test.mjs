import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksState } from '../connectors/github.mjs';

const run = (id, name, conclusion, startedAt, app = 15368) => ({
  id, name, status: 'completed', conclusion, started_at: startedAt, app: { id: app },
});

test('a failed attempt followed by a green re-run of the same check reads passing (RMA-382)', () => {
  // Setup
  const runs = [run(1, 'build', 'failure', '2026-11-06T10:00:00Z'), run(2, 'build', 'success', '2026-11-06T11:00:00Z')];
  // Exercise
  const checks = checksState(runs);
  // Verify
  assert.equal(checks.state, 'passing');
  assert.deepEqual(checks.failed, []);
});

test('a run that concurrency cancelled, replaced by a green one, reads passing', () => {
  // Setup
  const runs = [run(5, 'test', 'success', '2026-11-06T12:00:00Z'), run(4, 'test', 'cancelled', '2026-11-06T11:00:00Z')];
  // Exercise + Verify
  assert.equal(checksState(runs).state, 'passing');
});

test('a check whose latest attempt still fails reads failing and lists only that attempt', () => {
  // Setup
  const runs = [run(1, 'build', 'success', '2026-11-06T10:00:00Z'), run(2, 'build', 'failure', '2026-11-06T11:00:00Z'), run(3, 'lint', 'success', '2026-11-06T11:00:00Z')];
  // Exercise
  const checks = checksState(runs);
  // Verify
  assert.equal(checks.state, 'failing');
  assert.deepEqual(checks.failed.map((checkRun) => checkRun.id), [2]);
});

test('the same name from two apps are two checks, and equal start times fall to the higher id', () => {
  // Setup
  const runs = [
    run(1, 'ci', 'failure', '2026-11-06T10:00:00Z', 1),
    run(2, 'ci', 'success', '2026-11-06T10:00:00Z', 2),
    run(3, 'lint', 'failure', '2026-11-06T10:00:00Z'),
    run(4, 'lint', 'success', '2026-11-06T10:00:00Z'),
  ];
  // Exercise
  const checks = checksState(runs);
  // Verify
  assert.equal(checks.state, 'failing');
  assert.deepEqual(checks.failed.map((checkRun) => checkRun.id), [1]);
});

test('a re-run still in progress reads running, and no runs at all read none', () => {
  // Setup
  const rerunning = [run(1, 'build', 'failure', '2026-11-06T10:00:00Z'), { ...run(2, 'build', null, '2026-11-06T11:00:00Z'), status: 'in_progress' }];
  // Exercise + Verify
  assert.equal(checksState(rerunning).state, 'running');
  assert.equal(checksState([]).state, 'none');
});
