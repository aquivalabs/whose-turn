import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { appDir, startTestApi } from './fixtures/api.mjs';

const stubApi = async () => {
  const server = createServer((request, response) => {
    const body = request.url.startsWith('/api/summary') ? { moves: [{ key: 'PROJ-1', next: 'Pick it up', ws: 'w' }], new_events: 0, todos: [], errors: {}, workspaces: [] } : { items: [] };
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};

const talk = (child, messages) => new Promise((resolve) => {
  const replies = [];
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      replies.push(JSON.parse(line));
    }
    if (replies.length === messages.filter((message) => message.id !== undefined).length) {
      resolve(replies);
    }
  });
  child.stdin.write(`${messages.map((message) => JSON.stringify(message)).join('\n')}\n`);
});

test('the MCP server initialises, lists its tools and answers a summary call through the HTTP API', async () => {
  const api = await stubApi();
  const child = spawn(process.execPath, [new URL('../bin/mcp.mjs', import.meta.url).pathname], { env: { ...process.env, WHOSE_TURN_PORT: String(api.address().port) } });
  const replies = await talk(child, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whose_turn_summary", arguments: {} } },
  ]);
  child.kill();
  api.close();
  assert.equal(replies[0].result.serverInfo.name, 'whose-turn');
  assert.deepEqual(replies[1].result.tools.map((tool) => tool.name), ['whose_turn_summary', 'whose_turn_state', 'whose_turn_todos', 'whose_turn_config', 'whose_turn_feedback', 'whose_turn_reports', 'whose_turn_inbox']);
  assert.equal(JSON.parse(replies[2].result.content[0].text).moves[0].key, 'PROJ-1');
});

test('every writing MCP tool requires ws, and the server refuses a write that leaves it out', async () => {
  // Setup
  const { server, port } = await startTestApi();
  const child = spawn(process.execPath, [`${appDir}bin/mcp.mjs`], { env: { ...process.env, WHOSE_TURN_PORT: String(port) } });
  try {
    // Exercise
    const replies = await talk(child, [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whose_turn_todos', arguments: { action: 'add', text: 'x' } } },
    ]);
    // Verify
    const todos = replies[0].result.tools.find((tool) => tool.name === 'whose_turn_todos');
    assert.ok(todos.inputSchema.required.includes('ws'));
    assert.equal(replies[1].result.isError, true);
    const error = JSON.parse(replies[1].result.content[0].text).error;
    assert.equal(error.status, 'INVALID_ARGUMENT');
    assert.match(error.details[0].metadata.detail, /\bws\b/);
  } finally {
    child.kill();
    server.close();
  }
});
