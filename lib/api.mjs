/** The local HTTP API and the window's static files; every error leaves as the google.rpc.Status envelope from lib/errors.mjs. */
import { createServer } from 'node:http';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStatic } from './static.mjs';
import { ApiError, toApiError } from './errors.mjs';
import { connectorCatalogue, secretStores, secretTarget, secretsRequired } from '../connectors/index.mjs';
import { adapterViolations } from '../connectors/module.mjs';
import { desktopOf, entryShapeViolations, normaliseWorkspaces, settingsViolations, GLOBAL_SETTINGS, WORKSPACE_FIELDS } from './config.mjs';
import { FACTS } from './facts.mjs';
import { withHidden } from './registry.mjs';
import { HIDDEN_MODES } from './backoff.mjs';
import { createFeedback, installOf, reportPayload } from './feedback.mjs';
import { buildDiagnostics, channelOf } from './diagnostics.mjs';
import { MINUTE } from './text.mjs';
import { composeIssue, DEFAULT_COMPOSER } from './compose.mjs';
import { readSize, saveSize, checkMode, spawnOpener } from './window.mjs';
import { frameHandOff } from './handoff.mjs';
import { noUpdates } from './update.mjs';
import { LINE_BREAK } from './secrets.mjs';

const send = (response, code, body, contentType = 'application/json', cacheControl = 'no-store') => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(contentType === 'application/json' ? JSON.stringify(body) : body);
  response.writeHead(code, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': cacheControl, 'Content-Length': data.length });
  response.end(data);
};

/** The largest POST body the server reads; a config with every workspace stays far below it. */
export const MAX_BODY_BYTES = 1024 * 1024;

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      request.pause();
      reject(new ApiError('BODY_TOO_LARGE', { limit: MAX_BODY_BYTES }));
      return;
    }
    chunks.push(chunk);
  });
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

const WINDOW_PAGES = ['/', '/report', '/sheet'];

const wrongAddressPage = (port) => {
  const address = `http://127.0.0.1:${port}/`;
  return `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Whose Turn</title><p style="font: 15px system-ui; margin: 40px">The window opens only at the local address: <a href="${address}">${address}</a></p>`;
};

const CLOCK_SKEW_MS = 60 * 1000;

const marksProblem = (body) => {
  if (body.all !== undefined && body.all !== true) {
    return 'all must be true';
  }
  if (body.seen !== undefined && !(Array.isArray(body.seen) && body.seen.every((id) => typeof id === 'string'))) {
    return 'seen must be a list of strings';
  }
  if (body.unseen !== undefined && !(Array.isArray(body.unseen) && body.unseen.every((id) => typeof id === 'string'))) {
    return 'unseen must be a list of strings';
  }
  if ('base' in body && !(Number.isFinite(body.base) && body.base <= Date.now() + CLOCK_SKEW_MS)) {
    return 'base must be a number of milliseconds, not in the future';
  }
  if (body.notes !== undefined) {
    if (!body.notes || typeof body.notes !== 'object' || Array.isArray(body.notes)) {
      return 'notes must map row ids to a line of text';
    }
    const wrongNote = Object.entries(body.notes).find(([, value]) => typeof value !== 'string' || value.length > 200);
    if (wrongNote) {
      return `notes.${wrongNote[0]} must be text of at most 200 characters`;
    }
  }
  if (body.handled === undefined) {
    return '';
  }
  if (!body.handled || typeof body.handled !== 'object' || Array.isArray(body.handled)) {
    return 'handled must map row ids to an ISO date or null';
  }
  const wrong = Object.entries(body.handled).find(([, value]) => value !== null && !(typeof value === 'string' && Number.isFinite(Date.parse(value))));
  return wrong ? `handled.${wrong[0]} must be an ISO date or null` : '';
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
    health: {
      ok: parts.every((part) => part.health.ok),
      alerts: parts.flatMap((part) => part.health.alerts.map((alert) => (parts.length > 1 ? `${part.name}: ${alert.text}` : alert.text))),
    },
    workspaces: parts,
  };
};

const OPEN_COOLDOWN_MS = 5000;
const SETTING_DEFAULTS = Object.fromEntries(Object.entries(GLOBAL_SETTINGS).map(([key, field]) => [key, field.fallback]));
const PREVIEW_TTL_MS = 15 * MINUTE;

export const startApi = async ({ port, appDir, registry, requestPoll, saveConfig, secrets, inbox, http, reports, dataDir, opener = spawnOpener(appDir), updater = noUpdates(), changelog = null, version = '', failureLog = null, lifecycle = { quit: () => {}, restart: async () => {} } }) => {
  const windowFile = createStatic(join(appDir, 'dist'));
  const pick = (id) => {
    const workspaces = registry.workspaces;
    if (!workspaces.length) {
      throw new ApiError('NO_WORKSPACE');
    }
    if (!id) {
      return workspaces.find((workspace) => !workspace.hidden) || workspaces[0];
    }
    const found = workspaces.find((workspace) => workspace.id === id);
    if (!found) {
      throw new ApiError('NO_SUCH_WORKSPACE', { ws: id });
    }
    return found;
  };
  // README.md § API; RMA-115
  const pickForWrite = (id) => {
    if (!id) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'ws names the workspace this write belongs to' });
    }
    return pick(id);
  };

  // README § API, POST /api/quit and /api/restart
  const streams = new Set();

  const stream = (response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    const write = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    for (const workspace of registry.workspaces) {
      write({ ws: workspace.id, version: workspace.store.state.version, polled_at: workspace.store.state.polled_at });
    }
    write({ update: updater.status() });
    if (reports.hasNews?.()) {
      write({ report_news: true });
    }
    const unsubscribe = registry.subscribe(write);
    const unwatch = updater.subscribe(write);
    const unwatchReports = reports.subscribe?.(write);
    streams.add(write);
    const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 25000);
    response.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      unwatch();
      unwatchReports?.();
      streams.delete(write);
    });
  };

  const stopAfterReply = (response, state, act) => {
    streams.forEach((write) => write({ lifecycle: state }));
    response.on('finish', () => setTimeout(act, 100));
    return send(response, 200, { lifecycle: state });
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
      if (!registry.workspaces.length) {
        return send(response, 200, { workspaces: [], problems: registry.problems, update: updater.status() });
      }
      const workspace = pick(url.searchParams.get('ws'));
      return send(response, 200, { ...workspace.snapshot(url.searchParams.get('full') === '1'), workspaces: registry.workspaces.map((item) => item.describe()), problems: registry.problems, notifications: registry.notifications, update: updater.status() });
    }
    if (url.pathname === '/api/summary') {
      return send(response, 200, { ...aggregateSummary(registry.workspaces), problems: registry.problems, handed: inbox.pending().length, notifications: registry.notifications, update: updater.status() });
    }
    if (url.pathname === '/api/config') {
      const tables = Object.fromEntries(registry.workspaces.map((workspace) => [workspace.id, workspace.rulesTable]));
      return send(response, 200, { workspaces: registry.rawWorkspaces, notifications: registry.notifications, settings: registry.settings, settings_fields: GLOBAL_SETTINGS, problems: registry.problems, connectors: connectorCatalogue(), fields: WORKSPACE_FIELDS, facts: FACTS, tables, table_warnings: normaliseWorkspaces(registry.rawWorkspaces).warnings, config_file: registry.configFile });
    }
    if (url.pathname === '/api/changelog') {
      if (!changelog) {
        throw new ApiError('CHANGELOG_UNAVAILABLE');
      }
      return send(response, 200, changelog);
    }
    if (url.pathname === '/api/inbox') {
      return send(response, 200, { items: inbox.pending(url.searchParams.get('consumer') || '') });
    }
    if (url.pathname === '/api/feedback') {
      const id = url.searchParams.get('id');
      if (id) {
        return send(response, 200, { report: await reports.detail(id) });
      }
      const list = await reports.states();
      await reports.markSeen?.();
      return send(response, 200, { reports: list });
    }
    if (url.pathname === '/api/handoff') {
      if (url.searchParams.get('all') === '1') {
        return send(response, 200, frameHandOff('all workspaces', registry.workspaces.map((workspace) => workspace.handOffBody('workspace', workspace.id))), 'text/markdown');
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
        throw new ApiError('INVALID_ARGUMENT', { detail: 'text is empty' }, [{ field: 'text', description: 'A to-do needs some text.' }]);
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

  const handleNotifications = async (body) => {
    const desktop = desktopOf(body);
    if (desktop === undefined) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'desktop must be true or false' }, [{ field: 'desktop', description: 'Send {desktop: true} or {desktop: false}.' }]);
    }
    await registry.saveNotifications({ desktop });
    return { notifications: registry.notifications };
  };

  const handleSettings = async (settings) => {
    const violations = settingsViolations(settings);
    if (violations.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(violations.length) }, violations);
    }
    await registry.saveSettings(settings);
    return { settings: registry.settings, problems: registry.problems };
  };

  const handleConfig = async (body) => {
    if (body.settings !== undefined && body.workspaces === undefined) {
      return handleSettings(body.settings);
    }
    if (!Array.isArray(body.workspaces)) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'workspaces must be a list' });
    }
    if (!body.workspaces.length) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'keep at least one workspace' });
    }
    const shape = entryShapeViolations(body.workspaces);
    if (shape.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(shape.length) }, shape);
    }
    const { workspaces, violations } = normaliseWorkspaces(body.workspaces);
    if (violations.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(violations.length) }, violations);
    }
    const broken = await adapterViolations(body.workspaces, dataDir);
    if (broken.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(broken.length) }, broken);
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
    return { workspaces: registry.workspaces.map((workspace) => workspace.describe()), notifications: registry.notifications, problems: registry.problems, secrets_stored: stored.map(({ service, account }) => ({ service, account })) };
  };

  const handleHidden = async ({ id, hidden }) => {
    if (!registry.workspaces.some((workspace) => workspace.id === id)) {
      throw new ApiError('NO_SUCH_WORKSPACE', { ws: String(id || '') });
    }
    if (hidden !== null && !HIDDEN_MODES.includes(hidden)) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'hidden must be "parked", "paused" or null' }, [{ field: 'hidden', description: 'Send "parked", "paused" or null to show the workspace again.' }]);
    }
    const { violations } = normaliseWorkspaces(registry.rawWorkspaces.map((entry) => (entry.id === id ? withHidden(entry, hidden) : entry)));
    if (violations.length) {
      throw new ApiError('INVALID_CONFIG', { count: String(violations.length) }, violations);
    }
    const created = await registry.setHidden(id, hidden || '');
    await Promise.all(created.map((workspace) => workspace.pollIfDue()));
    return { workspaces: registry.workspaces.map((workspace) => workspace.describe()) };
  };

  const handleSecret = async (body) => {
    const service = String(body.service || '').trim();
    const account = String(body.account || '').trim();
    const value = String(body.value || '').trim();
    for (const [field, text] of Object.entries({ service, account, value })) {
      if (LINE_BREAK.test(text)) {
        throw new ApiError('INVALID_ARGUMENT', { detail: `${field} must not contain a line break` });
      }
    }
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
    const workspace = pickForWrite(body.ws);
    const kind = String(body.kind || 'workspace');
    const ref = kind === 'workspace' ? workspace.id : String(body.ref || '');
    const snapshot = workspace.handOffSnapshot(kind, ref);
    if (!snapshot) {
      throw new ApiError('NOT_FOUND', { kind, ref });
    }
    return { item: inbox.add({ ws: workspace.id, ws_name: workspace.name, kind, ref, snapshot }) };
  };

  let lastRemark = { text: '', at: 0 };
  const mentionsSecret = async (parts) => {
    const entries = normaliseWorkspaces(registry.rawWorkspaces).workspaces.flatMap((workspace) => workspace.connectors);
    const values = await Promise.all(secretStores(entries).map(({ service, account }) => secrets.get(service, account)));
    return values.some((value) => value && parts.some((part) => part.includes(value)));
  };

  let lastPreview = { token: '', diagnostics: null, at: 0 };
  const diagnosticsFor = (body, channel) => buildDiagnostics({
    version, channel, failureLog, window: body.window, agent: body.agent, pluginSeen: updater.pluginSeen?.(),
    workspaces: () => registry.workspaces.map((workspace) => workspace.diagnosticFacts()),
    update: () => updater.status(),
    settings: { ...SETTING_DEFAULTS, ...registry.settings },
  });
  const previewed = (token) => (token && token === lastPreview.token && Date.now() - lastPreview.at < PREVIEW_TTL_MS ? lastPreview.diagnostics : null);

  const handleFeedback = async (body) => {
    if ('context' in body) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'context is no longer accepted: a report carries only its text and the monitor version' }, [{ field: 'context', description: 'Remove it; nothing but what the user wrote leaves this machine.' }]);
    }
    const channel = channelOf({ client: body.client, from: body.from });
    const sources = (body.ws ? [pick(body.ws)] : registry.workspaces).flatMap((workspace) => workspace.sourceTypes);
    if (body.preview === true) {
      lastPreview = { token: randomUUID(), diagnostics: diagnosticsFor(body, channel), at: Date.now() };
      const { environment } = reportPayload({ version, sources, install: installOf(appDir), client: body.client });
      return { preview: { environment, diagnostics: lastPreview.diagnostics }, preview_token: lastPreview.token };
    }
    const remark = typeof body.text === 'string' ? body.text.trim() : '';
    if (!remark && !String(body.title || '').trim()) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'text is empty' }, [{ field: 'text', description: 'Write the remark, or pass a title.' }]);
    }
    if (remark && remark === lastRemark.text && Date.now() - lastRemark.at < 60_000) {
      throw new ApiError('INVALID_ARGUMENT', { detail: 'the same remark was just sent' });
    }
    if (remark) {
      lastRemark = { text: remark, at: Date.now() };
    }
    const diagnostics = previewed(body.preview_token) || diagnosticsFor(body, channel);
    try {
      const composer = registry.feedback && registry.feedback.composer && registry.feedback.composer.command ? registry.feedback.composer : DEFAULT_COMPOSER;
      const compose = (text) => composeIssue(text, { composer, bugWords: registry.feedback && registry.feedback.bug_words });
      const { composed_by: composedBy, ...issue } = await createFeedback({ http, reports, relayUrl: reports.relayUrl, version, sources, install: installOf(appDir), client: body.client, diagnostics, mentionsSecret, compose }, { text: remark, kind: body.kind, title: body.title, body: body.body, from: body.from });
      const list = await reports.states();
      await reports.markSeen?.();
      return { issue, composed_by: composedBy, reports: list };
    } catch (error) {
      lastRemark = { text: '', at: 0 };
      throw error;
    }
  };

  const lastOpen = new Map();

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
    if (url.pathname === '/api/workspaces/hidden') {
      return send(response, 200, await handleHidden(body));
    }
    if (url.pathname === '/api/notifications') {
      return send(response, 200, await handleNotifications(body));
    }
    if (url.pathname === '/api/secrets') {
      return send(response, 200, await handleSecret(body));
    }
    if (url.pathname === '/api/window') {
      return send(response, 200, saveSize(dataDir, body));
    }
    if (url.pathname === '/api/open') {
      const mode = checkMode(body.mode);
      const wait = OPEN_COOLDOWN_MS - (Date.now() - (lastOpen.get(mode) || -Infinity));
      if (wait > 0) {
        throw new ApiError('OPEN_TOO_SOON', { retry_after_seconds: Math.ceil(wait / 1000) });
      }
      lastOpen.set(mode, Date.now());
      opener({ mode, port });
      return send(response, 200, { ok: true });
    }
    if (url.pathname === '/api/update') {
      return send(response, 200, { update: updater.apply() });
    }
    if (url.pathname === '/api/quit') {
      return stopAfterReply(response, 'quitting', lifecycle.quit);
    }
    if (url.pathname === '/api/restart') {
      return stopAfterReply(response, 'restarting', lifecycle.restart);
    }
    if (url.pathname === '/api/update/plugin-copied') {
      return send(response, 200, { update: updater.pluginCopied() });
    }
    if (url.pathname === '/api/refresh') {
      requestPoll();
      return send(response, 200, { ok: true });
    }
    const workspace = pickForWrite(body.ws);
    if (url.pathname === '/api/marks') {
      const detail = marksProblem(body);
      if (detail) {
        throw new ApiError('INVALID_ARGUMENT', { detail });
      }
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
      if (request.headers['x-whose-turn-plugin']) {
        updater.sawPlugin?.(String(request.headers['x-whose-turn-plugin']).slice(0, 64), String(request.headers['x-whose-turn-plugin-knows'] || '').slice(0, 64));
      }
      if (request.method === 'GET') {
        await handleGet(url, request, response);
      } else if (request.method === 'POST') {
        await handlePost(url, request, response);
      } else {
        response.setHeader('Allow', 'GET, POST');
        throw new ApiError('METHOD_NOT_ALLOWED', { method: request.method || '' });
      }
    } catch (error) {
      if (!(error instanceof ApiError)) {
        console.error(error);
      }
      const apiError = toApiError(error);
      if (apiError.code === 403 && request.method === 'GET' && WINDOW_PAGES.includes(url.pathname)) {
        return send(response, 403, wrongAddressPage(port), 'text/html');
      }
      send(response, apiError.code, apiError.toEnvelope());
    }
  });
  await new Promise((resolve, reject) => {
    const refuse = (error) => reject(error.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use: stop the server holding it, or set WHOSE_TURN_PORT to a free port.`, { cause: error }) : error);
    server.once('error', refuse);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', refuse);
      resolve(undefined);
    });
  });
  port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  return server;
};
