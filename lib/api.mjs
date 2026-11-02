/** The local HTTP API and the window's static files; every error leaves as the google.rpc.Status envelope from lib/errors.mjs. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from './errors.mjs';

const STATIC = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/style.css': ['style.css', 'text/css'],
  '/app.js': ['app.js', 'application/javascript'],
  '/backdrop.js': ['backdrop.js', 'application/javascript'],
  '/vendor/popper.min.js': ['vendor/popper.min.js', 'application/javascript'],
  '/vendor/tippy-bundle.umd.min.js': ['vendor/tippy-bundle.umd.min.js', 'application/javascript'],
};

const loadStatic = async (appDir) => Object.fromEntries(await Promise.all(Object.entries(STATIC).map(async ([path, [file, contentType]]) => [path, [await readFile(join(appDir, file)), contentType]])));

const send = (response, code, body, contentType = 'application/json') => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(contentType === 'application/json' ? JSON.stringify(body) : body);
  response.writeHead(code, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': 'no-store', 'Content-Length': data.length });
  response.end(data);
};

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    try {
      resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
    } catch {
      reject(new ApiError('INVALID_BODY'));
    }
  });
  request.on('error', reject);
});

const assertLocal = (request, port) => {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(request.headers.host || '')) {
    throw new ApiError('FORBIDDEN_ORIGIN', { host: request.headers.host || '' });
  }
  const origin = request.headers.origin;
  if (origin && !allowedHosts.map((host) => `http://${host}`).includes(origin)) {
    throw new ApiError('FORBIDDEN_ORIGIN', { origin });
  }
  if (request.method === 'POST' && !/^application\/json/.test(request.headers['content-type'] || '')) {
    throw new ApiError('INVALID_BODY', { content_type: request.headers['content-type'] || '' });
  }
};

const aggregateSummary = (workspaces) => {
  const parts = workspaces.map((workspace) => workspace.summary());
  const errors = {};
  for (const part of parts) {
    for (const [source, message] of Object.entries(part.errors)) {
      errors[parts.length > 1 ? `${part.id}.${source}` : source] = message;
    }
  }
  return {
    moves: parts.flatMap((part) => part.moves.map((move) => ({ ...move, ws: part.id }))),
    new_events: parts.reduce((sum, part) => sum + part.new_events, 0),
    todos: parts.flatMap((part) => part.todos.map((todo) => ({ ...todo, ws: part.id }))),
    polled_at: parts.map((part) => part.polled_at).filter(Boolean).sort()[0] || '',
    errors,
    workspaces: parts,
  };
};

export const startApi = async ({ port, appDir, workspaces, problems, requestPoll }) => {
  const files = await loadStatic(appDir);
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const pick = (id) => {
    if (!id) {
      return workspaces[0];
    }
    if (!byId.has(id)) {
      throw new ApiError('NO_SUCH_WORKSPACE', { ws: id });
    }
    return byId.get(id);
  };

  const stream = (response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    const write = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    for (const workspace of workspaces) {
      write({ ws: workspace.id, version: workspace.store.state.version, polled_at: workspace.store.state.polled_at });
    }
    const unsubscribe = workspaces.map((workspace) => workspace.subscribe(write));
    const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 25000);
    response.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe.forEach((stop) => stop());
    });
  };

  const handleGet = async (url, request, response) => {
    if (files[url.pathname]) {
      const [body, contentType] = files[url.pathname];
      return send(response, 200, body, contentType);
    }
    if (url.pathname === '/api/workspaces') {
      return send(response, 200, workspaces.map((workspace) => workspace.describe()));
    }
    if (url.pathname === '/api/state') {
      const workspace = pick(url.searchParams.get('ws'));
      return send(response, 200, { ...workspace.snapshot(url.searchParams.get('full') === '1'), workspaces: workspaces.map((item) => item.describe()), problems });
    }
    if (url.pathname === '/api/summary') {
      return send(response, 200, { ...aggregateSummary(workspaces), problems });
    }
    if (url.pathname === '/api/stream') {
      return stream(response);
    }
    throw new ApiError('NOT_FOUND', { path: url.pathname });
  };

  const handleTodos = (workspace, body) => {
    if (body.action === 'add') {
      if (!String(body.text || '').trim()) {
        throw new ApiError('UNKNOWN_ACTION', { action: 'add', detail: 'empty text' });
      }
      workspace.addTodo(body);
    } else {
      const todo = workspace.store.todos.find((item) => item.id === body.id);
      if (!todo) {
        throw new ApiError('NO_SUCH_TODO', { id: body.id || '' });
      }
      if (!workspace.changeTodo(todo, body)) {
        throw new ApiError('UNKNOWN_ACTION', { action: body.action || '' });
      }
    }
    workspace.saveTodos();
    return workspace.store.todos;
  };

  const handlePost = async (url, request, response) => {
    const body = await readBody(request);
    const workspace = pick(body.ws);
    if (url.pathname === '/api/marks') {
      return send(response, 200, workspace.updateMarks(body));
    }
    if (url.pathname === '/api/todos') {
      return send(response, 200, handleTodos(workspace, body));
    }
    if (url.pathname === '/api/refresh') {
      requestPoll();
      return send(response, 200, { ok: true });
    }
    throw new ApiError('NOT_FOUND', { path: url.pathname });
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    try {
      assertLocal(request, port);
      if (request.method === 'GET') {
        await handleGet(url, request, response);
      } else if (request.method === 'POST') {
        await handlePost(url, request, response);
      } else {
        throw new ApiError('NOT_FOUND', { method: request.method });
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('NOT_FOUND', { detail: error.message });
      send(response, apiError.code, apiError.toEnvelope());
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
};
