import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const hook = async (summary) => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(summary));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const data = mkdtempSync(join(tmpdir(), 'wt-hook-'));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [new URL('../bin/summary.mjs', import.meta.url).pathname, 'hook'], { env: { ...process.env, WHOSE_TURN_PORT: String(server.address().port), WHOSE_TURN_DATA: data } });
    return JSON.parse(stdout);
  } finally {
    server.close();
    rmSync(data, { recursive: true, force: true });
  }
};

const connected = [{ id: 'w', connectors: [{ id: 'gh', type: 'github', label: 'GitHub' }] }];

test('the SessionStart hook lists the moves by rank, lowest first', async () => {
  // Setup
  const moves = [
    { key: 'PROJ-2', next: 'Pick it up', url: 'https://example.com/2', rank: 3 },
    { key: 'PROJ-1', next: 'Look at the failing checks', url: 'https://example.com/1', rank: 0 },
  ];
  // Exercise
  const output = await hook({ moves, todos: [], new_events: 0, errors: {}, workspaces: connected });
  // Verify
  const context = output.hookSpecificOutput.additionalContext;
  assert.ok(context.indexOf('PROJ-1') < context.indexOf('PROJ-2'));
  assert.match(output.systemMessage, /^Whose Turn: 2 your move — PROJ-1 Look at the failing checks; PROJ-2/);
  assert.doesNotMatch(context, /No source is connected/);
});

test('with no source connected the hook says so instead of "nothing is waiting"', async () => {
  // Exercise
  const output = await hook({ moves: [], todos: [], new_events: 0, errors: {}, workspaces: [{ id: 'default', connectors: [] }] });
  // Verify
  assert.match(output.systemMessage, /^Whose Turn: no source connected yet/);
  assert.match(output.hookSpecificOutput.additionalContext, /No source is connected yet.*demo workspace/);
});
