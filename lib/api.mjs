/** The local HTTP API and the window's static files; every error leaves as the google.rpc.Status envelope from lib/errors.mjs. */
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createStatic } from './static.mjs';
import { ApiError } from './errors.mjs';
import { connectorCatalogue, secretTarget, secretsRequired } from '../connectors/index.mjs';
import { normaliseWorkspaces, WORKSPACE_FIELDS } from './config.mjs';
import { createFeedback } from './feedback.mjs';
import { composeIssue, DEFAULT_COMPOSER } from './compose.mjs';
import { readSize, saveSize, checkMode, spawnOpener } from './window.mjs';

const send = (response, code, body, contentType = 'application/json', cacheControl = 'no-store') => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(contentType === 'application/json' ? JSON.stringify(body) : body);
  response.writeHead(code, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': cacheControl, 'Content-Length': data.length });
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

export const startApi = async ({ port, appDir, registry, requestPoll, saveConfig, secrets, inbox, http, reports, dataDir, opener = spawnOpener(appDir) }) => {
  const windowFile = createStatic(join(appDir, 'dist'));
  const feedbackCache = {};
  const pick = (id) => {
    const workspaces = registry.workspaces;
    if (!id) {
      return workspaces[0];
    }
    const found = workspaces.find((workspace) => workspace.id === id);
    if (!found) {
      throw new ApiError('NO_SUCH_WORKSPACE', { ws: id });
    }
    return found;
  };
  // A read may default to the first workspace; a write must name its workspace, or it silently lands in the wrong one (RMA-115).
  const pickForWrite = (id) => {
    if (!id) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'ws names the workspace this write belongs to' });
    }
    return pick(id);
  };

  const stream = (response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    const write = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    for (const workspace of registry.workspaces) {
      write({ ws: workspace.id, version: workspace.store.state.version, polled_at: workspace.store.state.polled_at });
    }
    const unsubscribe = registry.subscribe(write);
    const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 25000);
    response.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  };

  const handleGet = async (url, request, response) => {
    const file = url.pathname.startsWith('/api/') ? null : await windowFile(url.pathname);
    if (file) {
      return send(response, 200, file.body, file.type, file.cacheControl);
    }
    if (url.pathname === '/api/workspaces') {
      return send(response, 200, registry.workspaces.map((workspace) => workspace.describe()));
    }
    if (url.pathname === '/api/state') {
      const workspace = pick(url.searchParams.get('ws'));
      return send(response, 200, { ...workspace.snapshot(url.searchParams.get('full') === '1'), workspaces: registry.workspaces.map((item) => item.describe()), problems: registry.problems });
    }
    if (url.pathname === '/api/summary') {
      return send(response, 200, { ...aggregateSummary(registry.workspaces), problems: registry.problems, handed: inbox.pending().length });
    }
    if (url.pathname === '/api/config') {
      return send(response, 200, { workspaces: registry.rawWorkspaces, problems: registry.problems, connectors: connectorCatalogue(), fields: WORKSPACE_FIELDS, config_file: registry.configFile });
    }
    if (url.pathname === '/api/inbox') {
      return send(response, 200, { items: inbox.pending(url.searchParams.get('consumer') || '') });
    }
    if (url.pathname === '/api/feedback') {
      const id = url.searchParams.get('id');
      if (id) {
        return send(response, 200, { report: await reports.detail(reportDeps(), id) });
      }
      const list = await reports.states(reportDeps());
      return send(response, 200, { configured: Boolean(registry.feedback && registry.feedback.workspace && registry.feedback.team && registry.feedback.project), project: registry.feedback ? registry.feedback.project : '', reports: list });
    }
    if (url.pathname === '/api/handoff') {
      if (url.searchParams.get('all') === '1') {
        const text = registry.workspaces.map((workspace) => workspace.handOffText('workspace', workspace.id)).join('\n');
        return send(response, 200, `# Whose Turn · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n\n${text}`, 'text/markdown');
      }
      const workspace = pick(url.searchParams.get('ws'));
      const kind = url.searchParams.get('kind') || 'workspace';
      const text = workspace.handOffText(kind, kind === 'workspace' ? workspace.id : url.searchParams.get('ref') || '');
      if (!text) {
        throw new ApiError('NOT_FOUND', { kind, ref: url.searchParams.get('ref') || '' });
      }
      return send(response, 200, text, 'text/markdown');
    }
    if (url.pathname === '/api/window') {
      return send(response, 200, readSize(dataDir));
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

  const resolveSecrets = (workspaces, pending) => pending.map((item) => {
    const workspace = workspaces.find((candidate) => candidate.id === item.ws);
    const entry = workspace?.connectors.find((candidate) => candidate.id === item.connector);
    const target = entry ? secretTarget(entry, item.key) : null;
    if (!target || !String(item.value || '').trim()) {
      throw new ApiError('INVALID_ARGUMENT', { detail: `no secret field ${item.key || ''} on connector ${item.connector || ''} of workspace ${item.ws || ''}, or the account for it is empty` });
    }
    return { ...target, value: String(item.value).trim() };
  });

  const handleConfig = async (body) => {
    if (!Array.isArray(body.workspaces)) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'workspaces must be a list' });
    }
    const { workspaces, problems } = normaliseWorkspaces(body.workspaces);
    if (problems.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(problems.length) }, problems);
    }
    const stored = resolveSecrets(workspaces, Array.isArray(body.secrets) ? body.secrets : []);
    const currentEntries = normaliseWorkspaces(registry.rawWorkspaces).workspaces.flatMap((workspace) => workspace.connectors);
    const missing = [];
    for (const workspace of workspaces) {
      for (const entry of workspace.connectors) {
        for (const key of secretsRequired(currentEntries, entry)) {
          const supplied = (body.secrets || []).some((item) => item.ws === workspace.id && item.connector === entry.id && item.key === key && String(item.value || '').trim());
          if (!supplied) {
            missing.push(`Workspace "${workspace.id}", connector "${entry.id}": the ${key} must be entered again because its account, store entry or endpoint changed.`);
          }
        }
      }
    }
    if (missing.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(missing.length) }, missing);
    }
    for (const secret of stored) {
      await secrets.set(secret.service, secret.account, secret.value);
    }
    await saveConfig(body.workspaces);
    return { workspaces: registry.workspaces.map((workspace) => workspace.describe()), problems: registry.problems, secrets_stored: stored.map(({ service, account }) => ({ service, account })) };
  };

  const handleSecret = async (body) => {
    const service = String(body.service || '').trim();
    const account = String(body.account || '').trim();
    const value = String(body.value || '').trim();
    if (!/^[\w.-]{1,80}$/.test(service) || !account || !value) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'service, account and value are required' });
    }
    await secrets.set(service, account, value);
    return { ok: true, service, account };
  };

  const withContext = (item) => {
    const workspace = registry.workspaces.find((candidate) => candidate.id === item.ws);
    return { ...item, context: workspace ? workspace.handOff(item.kind, item.ref) : null };
  };

  const handleInbox = (body) => {
    if (body.action === 'clear') {
      inbox.clear();
      return { items: [] };
    }
    if (body.action === 'take') {
      const consumer = String(body.consumer || '').trim();
      if (!consumer) {
        throw new ApiError('INVALID_ARGUMENT', { detail: 'consumer names who takes the items' });
      }
      return { items: inbox.take(consumer).map(withContext) };
    }
    const workspace = pick(body.ws);
    const kind = String(body.kind || 'workspace');
    const ref = kind === 'workspace' ? workspace.id : String(body.ref || '');
    const snapshot = workspace.handOffSnapshot(kind, ref);
    if (!snapshot) {
      throw new ApiError('NOT_FOUND', { kind, ref });
    }
    return { item: inbox.add({ ws: workspace.id, ws_name: workspace.name, kind, ref, snapshot }) };
  };

  const reportDeps = () => ({ settings: registry.feedback, secrets, http });

  const handleFeedback = async (body) => {
    let context = null;
    if (body.ws && body.kind_ref) {
      const workspace = pick(body.ws);
      context = workspace.handOffText(body.kind_ref.kind, body.kind_ref.ref);
    }
    try {
      const composer = registry.feedback && registry.feedback.composer && registry.feedback.composer.command ? registry.feedback.composer : DEFAULT_COMPOSER;
      const shaped = body.text ? await composeIssue(body.text, { about: context || '', composer, bugWords: registry.feedback && registry.feedback.bug_words }) : { kind: body.kind, title: body.title, body: body.body, composed_by: body.from || 'caller' };
      const issue = await createFeedback({ settings: registry.feedback, secrets, http, cache: feedbackCache, reports }, { kind: shaped.kind, title: shaped.title, body: shaped.body, from: body.from, context: context || body.context || null });
      return { issue, composed_by: shaped.composed_by, reports: await reports.states(reportDeps()) };
    } catch (error) {
      throw new ApiError('INVALID_ARGUMENT', { detail: error.message });
    }
  };

  const handlePost = async (url, request, response) => {
    const body = await readBody(request);
    if (url.pathname === '/api/feedback') {
      return send(response, 200, await handleFeedback(body));
    }
    if (url.pathname === '/api/inbox') {
      return send(response, 200, handleInbox(body));
    }
    if (url.pathname === '/api/config') {
      return send(response, 200, await handleConfig(body));
    }
    if (url.pathname === '/api/secrets') {
      return send(response, 200, await handleSecret(body));
    }
    if (url.pathname === '/api/window') {
      return send(response, 200, saveSize(dataDir, body));
    }
    if (url.pathname === '/api/open') {
      opener({ mode: checkMode(body.mode), port });
      return send(response, 200, { ok: true });
    }
    if (url.pathname === '/api/refresh') {
      requestPoll();
      return send(response, 200, { ok: true });
    }
    const workspace = pickForWrite(body.ws);
    if (url.pathname === '/api/marks') {
      return send(response, 200, workspace.updateMarks(body));
    }
    if (url.pathname === '/api/todos') {
      return send(response, 200, handleTodos(workspace, body));
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
