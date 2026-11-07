import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorProblem } from '../web/src/lib/problems.ts';

test('the empty-list message points at Settings', () => {
  const error = { code: 412, status: 'FAILED_PRECONDITION', message: 'x', details: [{ '@type': 'ErrorInfo', reason: 'NO_WORKSPACE', domain: 'whose-turn', metadata: {} }] };
  assert.equal(errorProblem(error), 'No workspace configured. Add one with + in the rail.');
});
