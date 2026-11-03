import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryWithoutWorkspace, NO_WORKSPACE_MESSAGE } from '../web/src/lib/load-retry.ts';

test('a refused state request is retried only when a workspace was asked for', () => {
  assert.equal(retryWithoutWorkspace('northwind'), true);
  assert.equal(retryWithoutWorkspace(''), false);
});

test('the empty-list message points at Settings', () => {
  assert.equal(NO_WORKSPACE_MESSAGE, 'No workspace configured. Open Settings.');
});
