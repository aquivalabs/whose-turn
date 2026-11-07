/** A report's machine-collected context: closed keys, closed values and aggregates only, never a name, key, title, link or error text. RMA-383, RMA-291. */
import { join } from 'node:path';
import { Adapter } from './adapter.mjs';
import { readJson, writeJson } from './store.mjs';
import { RateLimited } from './http-client.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
import { VERSION as SEMVER } from './update.mjs';
import { HOUR, MINUTE, intInRange, isObject } from './text.mjs';

const FAILURE_CODES = ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_5XX', 'PARSE_FAILED', 'PARTIAL', 'UNKNOWN_TYPE', 'UNKNOWN'];
const CHANNELS = ['window', 'api', 'mcp:claude-code', 'mcp:claude-desktop', 'mcp:other'];
export const PANELS = ['dashboard', 'settings', 'monitor_settings', 'whats_new', 'comment', 'note'];
/** The plugin's MCP tools; any other name an agent reports is dropped. */
/** The plugin's MCP tool names a report may carry; `scripts/skill-knows-release.mjs` refuses a release while they differ from the plugin's. */
export const AGENT_TOOLS = ['whose_turn_summary', 'whose_turn_state', 'whose_turn_inbox', 'whose_turn_todos', 'whose_turn_mark_handled', 'whose_turn_unmark_handled', 'whose_turn_mark_read', 'whose_turn_refresh', 'whose_turn_update', 'whose_turn_restart', 'whose_turn_quit', 'whose_turn_start', 'whose_turn_config', 'whose_turn_workspace_visibility', 'whose_turn_notifications', 'whose_turn_settings', 'whose_turn_whats_new', 'whose_turn_feedback', 'whose_turn_reports'];

const BY_STATUS = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' };
const BY_NAME = { TimeoutError: 'TIMEOUT', AbortError: 'TIMEOUT', SyntaxError: 'PARSE_FAILED', ContractError: 'PARSE_FAILED' };
const MAX_LIST = 10;
const WRITE_DELAY = 1000;
const MAX_KEYS = 60;
const KEY = /^[a-z][a-z0-9_.]{0,39}$/;
const TEXT = /^[A-Za-z0-9_.:+-]{0,64}$/;

/** The closed code for a failed poll, from the error's class and upstream status only. */
export const failureCode = (error) => {
  if (error instanceof RateLimited) {
    return 'RATE_LIMITED';
  }
  const status = error?.upstreamStatus;
  if (BY_STATUS[status]) {
    return BY_STATUS[status];
  }
  if (status >= 500) {
    return 'UPSTREAM_5XX';
  }
  return BY_NAME[error?.name] || 'UNKNOWN';
};

/** A connector type as a report may name it: a built-in adapter type, else `other`, the user's own sources included. */
export const sourceType = (type) => (Object.hasOwn(CONNECTORS, type) && CONNECTORS[type] instanceof Adapter && !CONNECTORS[type].experimental ? type : 'other');

/** A count as a report may carry it. */
export const bucket = (count) => (count === 0 ? '0' : count <= 5 ? '1-5' : count <= 20 ? '6-20' : '21+');

const ageBucket = (age) => (age < HOUR ? 'lt1h' : age < 6 * HOUR ? '1-6h' : age < 24 * HOUR ? '6-24h' : 'gt24h');

/** The last ten poll failures as `{type, code, at}`, kept in `<data>/failures.json` so they outlive a restart. */
export const openFailureLog = (dataDir, now = Date.now) => {
  const file = join(dataDir, 'failures.json');
  const valid = (entry) => entry && typeof entry.type === 'string' && FAILURE_CODES.includes(entry.code) && Number.isFinite(entry.at);
  let entries = readJson(file, []).filter(valid).slice(-MAX_LIST);
  let timer;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    writeJson(file, entries);
  };
  return {
    record: (type, code) => {
      entries = [...entries, { type: sourceType(type), code: FAILURE_CODES.includes(code) ? code : 'UNKNOWN', at: now() }].slice(-MAX_LIST);
      timer ??= setTimeout(flush, WRITE_DELAY).unref();
    },
    recent: () => entries,
    flush,
  };
};

/** The channel a report came from: the window when it sent its own description, else the MCP client mapped to a closed name, else the API. */
export const channelOf = ({ client, from }) => {
  if (isObject(client)) {
    return 'window';
  }
  const name = String(from || '');
  if (!name.startsWith('mcp:')) {
    return 'api';
  }
  const known = { 'mcp:claude-code': 'mcp:claude-code', 'mcp:claude-ai': 'mcp:claude-desktop' };
  return known[name] || 'mcp:other';
};

const minutesSince = (at, now) => (at ? Math.floor((now - at) / MINUTE) : 'none');

const workspaceBlock = (facts, now) => {
  const shown = facts.filter((fact) => !fact.hidden);
  const worst = (pick) => {
    const times = shown.map(pick).filter(Boolean);
    return times.length === shown.length && times.length ? Math.min(...times) : 0;
  };
  const failing = [...new Set(shown.flatMap((fact) => fact.failures.map((failure) => `${sourceType(failure.type)}:${failure.code}`)))].sort();
  const total = (key) => shown.reduce((sum, fact) => sum + fact.rows[key], 0);
  return {
    'workspaces.total': bucket(facts.length),
    'workspaces.parked': bucket(facts.filter((fact) => fact.hidden === 'parked').length),
    'workspaces.paused': bucket(facts.filter((fact) => fact.hidden === 'paused').length),
    'workspaces.stale': bucket(shown.filter((fact) => fact.stale).length),
    'workspaces.never_polled': bucket(shown.filter((fact) => !fact.lastAttemptAt).length),
    'poll.last_attempt_minutes': minutesSince(worst((fact) => fact.lastAttemptAt), now),
    'poll.last_success_minutes': minutesSince(worst((fact) => fact.lastSuccessAt), now),
    'failures.now': failing,
    'rules.custom': bucket(facts.filter((fact) => fact.customRules).length),
    'settings.workflow_runs_off': bucket(facts.reduce((sum, fact) => sum + fact.workflowRunsOff, 0)),
    ...Object.fromEntries(['your_move', 'waiting', 'done', 'failing_checks', 'review_requested', 'mentions'].map((key) => [`rows.${key}`, bucket(total(key))])),
  };
};

const updateBlock = (status) => ({
  'update.state': ['idle', 'installing', 'restarting', 'failed'].includes(status.state) ? status.state : 'other',
  'update.available': Boolean(status.available),
  'update.latest': SEMVER.test(String(status.latest || '')) ? status.latest : 'none',
  ...(status.pinned ? { 'update.pinned': SEMVER.test(status.pinned) ? status.pinned : 'other' } : {}),
});

const windowBlock = (window) => {
  if (!isObject(window)) {
    return {};
  }
  const count = (value) => (intInRange(value, 0, 100000) ? value : undefined);
  const ratio = (value) => (intInRange(value, 0, 100) ? Math.round(value / 10) * 10 : undefined);
  const block = {
    'window.panel': PANELS.includes(window.panel) ? window.panel : 'other',
    'window.font_px': Number.isFinite(window.font_px) && window.font_px >= 6 && window.font_px <= 72 ? Math.round(window.font_px) : undefined,
    'window.console_errors': count(window.console_errors),
    'window.stream_reconnects': count(window.stream_reconnects),
    'window.stream_last_event_minutes': count(window.stream_last_event_minutes),
    'window.api_failures': Array.isArray(window.api_failures) ? window.api_failures.filter((code) => intInRange(code, 100, 599)).slice(-MAX_LIST).map(String) : undefined,
    ...Object.fromEntries(['your_move', 'waiting', 'feed'].map((panel) => [`window.scroll.${panel}`, ratio(window.scroll?.[panel])])),
  };
  return Object.fromEntries(Object.entries(block).filter(([, value]) => value !== undefined));
};

/** Throws away every key or value the relay would refuse, so a diagnostics block can never sink a report. */
export const fitForRelay = (diagnostics) => {
  const fits = (value) => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && TEXT.test(value));
  const entries = Object.entries(diagnostics)
    .filter(([key]) => KEY.test(key))
    .map(([key, value]) => [key, Array.isArray(value) ? value.filter((item) => typeof item === 'string' && TEXT.test(item)).slice(0, MAX_LIST) : value])
    .filter(([, value]) => Array.isArray(value) || fits(value));
  return Object.fromEntries(entries.slice(0, MAX_KEYS));
};

/**
 * Builds the diagnostics of one report from in-memory state; a block that throws becomes `diag.error`.
 * @example buildDiagnostics({ version, channel: 'window', workspaces, update, settings, failureLog, window, agent, pluginSeen })
 */
export const buildDiagnostics = ({ version, channel, workspaces = () => [], update = () => ({}), settings = {}, failureLog, window, agent, pluginSeen = '', now = Date.now() }) => {
  const errors = [];
  const safely = (name, collect) => {
    try {
      return collect();
    } catch {
      errors.push(name);
      return {};
    }
  };
  const recent = safely('failures', () => {
    const entries = failureLog ? failureLog.recent() : [];
    return { 'failures.recent': entries.map((entry) => `${entry.type}:${entry.code}`), 'failures.recent_age': entries.map((entry) => ageBucket(now - entry.at)) };
  });
  const diagnostics = {
    channel: CHANNELS.includes(channel) ? channel : 'api',
    'monitor.version': SEMVER.test(String(version || '')) ? version : 'unknown',
    ...safely('update', () => updateBlock(update())),
    ...safely('settings', () => Object.fromEntries(['poll_seconds', 'history_days', 'stale_minutes', 'failing_polls'].filter((key) => Number.isFinite(settings[key])).map((key) => [`settings.${key}`, settings[key]]))),
    ...safely('workspaces', () => workspaceBlock(workspaces(), now)),
    ...recent,
    ...safely('window', () => (channel === 'window' ? windowBlock(window) : {})),
    ...safely('agent', () => (channel.startsWith('mcp:') ? {
      'plugin.version_seen': SEMVER.test(String(pluginSeen || '')) ? pluginSeen : 'old_no_header',
      'agent.tools': (Array.isArray(agent?.tools) ? agent.tools : []).filter((tool) => AGENT_TOOLS.includes(tool)).slice(-5),
      ...(intInRange(agent?.errors, 0, 1000) ? { 'agent.errors': agent.errors } : {}),
    } : {})),
  };
  return fitForRelay(errors.length ? { ...diagnostics, 'diag.error': errors } : diagnostics);
};
