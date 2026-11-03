/** One workspace: polls its connector entries, stores each result by source, merges them by kind, evaluates the rules once per version and notifies. */
import { openStore } from './store.mjs';
import { compileRules, turnRows, feedRows, myMoves, ticketEvents } from './rules.mjs';
import { makeKeyFinder, nowIso, daysAgoIso, unionCapped, DAY } from './text.mjs';
import { buildHandOff, snapshotOf, renderHandOff, frameHandOff } from './handoff.mjs';
import { notify as desktopNotify } from './notify.mjs';
import { DEFAULT_LIMITS, nextFails, assess, transition } from './health.mjs';
import { paletteFrom } from './palette.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
const KINDS = ['tickets', 'comments', 'prs', 'activity', 'asks'];

const stamp = (result, sourceId) => {
  const stamped = { ...result };
  for (const kind of KINDS) {
    stamped[kind] = (result[kind] || []).map((item) => ({ ...item, source: sourceId }));
  }
  return stamped;
};

export const createWorkspace = (definition, { dataDir, historyDays, http, secrets, limits = () => DEFAULT_LIMITS, notify = desktopNotify }) => {
  const store = openStore(dataDir, definition.id);
  const rules = compileRules(definition.rules);
  const keyOf = makeKeyFinder(definition.key_pattern);
  const theme = definition.theme ? paletteFrom(definition.theme.seed, definition.theme.accent) : null;
  const caches = {};
  const listeners = new Set();
  let digest = '';
  let derived = null;
  let freshAt = '';
  const startedAt = nowIso();

  const sources = () => Object.values(store.state.sources);
  const merged = () => Object.fromEntries(KINDS.map((kind) => [kind, sources().flatMap((source) => source[kind] || [])]));
  const me = () => Object.fromEntries(Object.entries(store.state.sources).map(([id, source]) => [id, source.me || '']));
  const ticketUrl = (key) => {
    const base = sources().map((source) => source.ticket_base).find(Boolean);
    return base ? `${base}${key}` : '';
  };

  const rows = () => {
    const day = nowIso().slice(0, 10);
    if (!derived || derived.version !== store.state.version || derived.day !== day) {
      const state = { ...merged(), events: store.state.events };
      const context = { me: me(), rules, historyDays, ticketUrl };
      derived = { version: store.state.version, day, turn: turnRows(state, context), feed: feedRows(state, context) };
    }
    return derived;
  };

  const emit = () => {
    const message = { ws: definition.id, version: store.state.version, polled_at: store.state.polled_at, open_moves: myMoves(rows().turn, store.marks).length };
    for (const listener of listeners) {
      listener(message);
    }
  };

  const notifyNewMoves = () => {
    const moves = myMoves(rows().turn, store.marks);
    const known = new Set(store.marks.notified);
    const fresh = moves.filter((move) => !known.has(move.row_id));
    if (!fresh.length) {
      return;
    }
    if (store.marks.notified_seeded) {
      const title = fresh.length === 1 ? `${definition.name}: your move on ${fresh[0].key}` : `${definition.name}: ${fresh.length} new items are your move`;
      notify(title, fresh.length === 1 ? fresh[0].next : fresh.slice(0, 3).map((move) => `${move.key} — ${move.next}`).join('; '));
    }
    store.marks.notified = unionCapped(store.marks.notified, fresh.map((move) => move.row_id));
    store.saveMarks();
  };

  const health = () => assess({ fails: store.state.fails, freshAt: freshAt || startedAt, now: Date.now(), limits: limits(), sourceCount: definition.connectors.length });

  let shownStreaks = '';

  const checkHealth = () => {
    const { alerts } = health();
    const { raised, recovered, alerted } = transition(store.marks.health_alerted, alerts);
    const streaks = alerts.filter((alert) => alert.id.startsWith('failing:')).map((alert) => alert.text).join('\n');
    if (!raised.length && !recovered.length) {
      if (streaks !== shownStreaks) {
        shownStreaks = streaks;
        store.state.version += 1;
        emit();
      }
      return;
    }
    shownStreaks = streaks;
    if (raised.length) {
      notify(`${definition.name}: monitor needs attention`, raised.map((alert) => alert.text).join('; '));
    } else if (!alerted.length) {
      notify(`${definition.name}: monitor recovered`, 'Data is flowing again');
    }
    store.marks.health_alerted = alerted;
    store.saveMarks();
    store.state.version += 1;
    emit();
  };

  const pollSource = async (entry) => {
    const connector = CONNECTORS[entry.type];
    if (!connector) {
      return { errors: { [entry.id]: `Unknown connector type "${entry.type}"` } };
    }
    caches[entry.id] = caches[entry.id] || store.loadCache(entry.id);
    try {
      const result = await connector.poll({ settings: entry, http, secrets, cache: caches[entry.id], sinceIso: daysAgoIso(historyDays), historyDays, keyOf });
      const errors = Object.fromEntries(Object.entries(result.errors || {}).map(([part, message]) => [`${entry.id}.${part}`, message]));
      return { data: stamp(result, entry.id), errors };
    } catch (error) {
      const rateLimited = error.name === 'RateLimited';
      return { errors: { [entry.id]: `${rateLimited ? 'rate limited' : error.name}: ${error.message}` }, rateLimited };
    }
  };

  const saveCaches = () => {
    const keysByEntry = Object.fromEntries(definition.connectors.map((entry) => [entry.id, CONNECTORS[entry.type]?.persistedCache || []]));
    store.saveCaches(caches, keysByEntry);
  };

  const poll = async () => {
    expireHandled();
    const outcomes = await Promise.all(definition.connectors.map(pollSource));
    const state = store.state;
    const errors = {};
    const ticketsBefore = merged().tickets;
    definition.connectors.forEach((entry, index) => {
      const outcome = outcomes[index];
      Object.assign(errors, outcome.errors);
      if (outcome.data) {
        state.sources[entry.id] = outcome.data;
      }
    });
    for (const id of Object.keys(state.sources)) {
      if (!definition.connectors.some((entry) => entry.id === id)) {
        delete state.sources[id];
      }
    }
    if (ticketsBefore.length) {
      state.events = [...ticketEvents(ticketsBefore, merged().tickets), ...state.events].slice(0, 500);
    }
    state.errors = errors;
    state.polled_at = nowIso();
    if (outcomes.some((outcome) => outcome.data)) {
      freshAt = state.polled_at;
    }
    const fails = nextFails(state.fails, definition.connectors.map((entry, index) => ({ id: entry.id, failed: Object.keys(outcomes[index].errors).length > 0 })));
    const failsChanged = JSON.stringify(fails) !== JSON.stringify(state.fails);
    state.fails = fails;
    const next = JSON.stringify([state.sources, state.errors]);
    if (next !== digest) {
      digest = next;
      state.version += 1;
      store.saveState();
      if (outcomes.some((outcome) => outcome.data)) {
        notifyNewMoves();
        store.marks.notified_seeded = true;
        store.saveMarks();
      }
    } else if (failsChanged) {
      store.saveState();
    }
    if (outcomes.some((outcome) => outcome.data)) {
      saveCaches();
    }
    checkHealth();
    emit();
    return { errors, rateLimited: outcomes.some((outcome) => outcome.rateLimited) };
  };

  const quickLinks = () => {
    const derived = definition.connectors.flatMap((entry) => (CONNECTORS[entry.type]?.links ? CONNECTORS[entry.type].links(entry) : []));
    const own = definition.links || [];
    const seen = new Set();
    return [...own, ...derived].filter((link) => !seen.has(link.url) && seen.add(link.url));
  };

  const expireHandled = () => {
    const limit = Date.now() - 7 * DAY;
    let changed = false;
    for (const [rowId, at] of Object.entries(store.marks.handled)) {
      if (new Date(at).getTime() < limit) {
        delete store.marks.handled[rowId];
        changed = true;
      }
    }
    if (changed) {
      store.saveMarks();
    }
  };

  const identity = () => ({
    id: definition.id, name: definition.name, key_pattern: definition.key_pattern, links: quickLinks(),
    connectors: definition.connectors.map((entry) => ({ id: entry.id, type: entry.type, label: entry.label || CONNECTORS[entry.type]?.label || entry.type })),
    open_moves: myMoves(rows().turn, store.marks).length,
  });

  const describe = () => ({ ...identity(), theme });

  const todosWithLinks = () => store.todos.map((todo) => ({ ...todo, ticket_url: todo.key ? ticketUrl(todo.key) : '' }));

  const snapshot = (full) => ({
    version: store.state.version, polled_at: store.state.polled_at, errors: store.state.errors, health: health(), me: me(),
    turn: rows().turn, feed: rows().feed, marks: store.marks, todos: todosWithLinks(), workspace: describe(),
    ...(full ? { ...merged(), events: store.state.events } : {}),
  });

  const handOffSource = () => ({
    data: merged(), turn: rows().turn, feed: rows().feed, workspace: describe(), rules: definition.rules,
    moves: myMoves(rows().turn, store.marks), todos: todosWithLinks().filter((todo) => !todo.done), errors: store.state.errors,
    handled: (row) => Boolean(store.marks.handled[row.row_id]),
  });
  const handOff = (kind, ref) => buildHandOff(kind, ref, handOffSource());
  const handOffBody = (kind, ref) => {
    const context = handOff(kind, ref);
    return context ? renderHandOff(kind, context) : null;
  };
  const handOffText = (kind, ref) => {
    const body = handOffBody(kind, ref);
    return body && frameHandOff(definition.name, [body]);
  };
  const handOffSnapshot = (kind, ref) => snapshotOf(kind, ref, handOffSource());

  const summary = () => {
    const seen = new Set(store.marks.seen);
    const unread = rows().feed.filter((item) => !seen.has(item.id) && new Date(item.at).getTime() > store.marks.base).length;
    return { ...identity(), moves: myMoves(rows().turn, store.marks), new_events: unread, todos: todosWithLinks().filter((todo) => !todo.done), polled_at: store.state.polled_at, errors: store.state.errors, health: health() };
  };

  const updateMarks = (body) => {
    const marks = store.marks;
    if (body.seen) {
      marks.seen = unionCapped(marks.seen, body.seen);
    }
    if ('base' in body) {
      marks.base = body.base;
    }
    for (const [rowId, value] of Object.entries(body.handled || {})) {
      if (value === null) {
        delete marks.handled[rowId];
      } else {
        marks.handled[rowId] = value;
      }
    }
    store.saveMarks();
    emit();
    return marks;
  };

  const addTodo = (body) => {
    const text = String(body.text).trim().slice(0, 500);
    store.todos.unshift({ id: `t${Date.now()}`, text, key: body.key || keyOf(text), created: nowIso(), by: String(body.by || 'you').slice(0, 20), done: null });
  };

  const changeTodo = (todo, body) => {
    switch (body.action) {
      case 'done':
        todo.done = nowIso();
        return true;
      case 'undo':
        todo.done = null;
        return true;
      case 'delete':
        store.todos.splice(store.todos.indexOf(todo), 1);
        return true;
      case 'edit':
        if (!String(body.text || '').trim()) {
          return false;
        }
        todo.text = String(body.text).trim().slice(0, 500);
        todo.key = keyOf(todo.text) || todo.key || '';
        return true;
      default:
        return false;
    }
  };

  const saveTodos = () => {
    store.saveTodos();
    store.state.version += 1;
    emit();
  };

  return {
    id: definition.id, name: definition.name, rulesTable: rules.table, store, poll, snapshot, summary, describe, checkHealth, handOff, handOffBody, handOffText, handOffSnapshot, updateMarks, addTodo, changeTodo, saveTodos,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
};
