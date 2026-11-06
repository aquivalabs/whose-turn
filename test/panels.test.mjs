import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANELS as serverPanels } from '../lib/diagnostics.mjs';
import { PANELS as windowPanels } from '../web/src/lib/window-report.ts';

test('the window and the server name the same closed list of panels', () => {
  assert.deepEqual([...windowPanels], serverPanels);
});
