import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withOpenMoves } from '../web/src/lib/moves.ts';

test('only the named workspace badge changes, and an equal count keeps the same list', () => {
  const list = [{ id: 'a', open_moves: 2 }, { id: 'b', open_moves: 1 }];
  assert.deepEqual(withOpenMoves(list, 'a', 1), [{ id: 'a', open_moves: 1 }, { id: 'b', open_moves: 1 }]);
  assert.equal(withOpenMoves(list, 'a', 2), list);
  assert.equal(withOpenMoves(list, 'zzz', 5), list);
  assert.equal(list[0].open_moves, 2);
});
