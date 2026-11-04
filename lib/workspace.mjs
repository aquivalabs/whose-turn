/** One workspace: polls its connector entries, stores each result by source, merges them by kind, evaluates the rules once per version and notifies. */
import { openStore } from './store.mjs';
import { compileRules, turnRows, feedRows, myMoves, isHandled, withHandled, turnCounts, ticketEvents } from './rules.mjs';
import { makeKeyFinder, nowIso, oneline, daysAgoIso, unionCapped, DAY } from './text.mjs';
import { passedRows, traceOf } from './trace.mjs';
import { buildHandOff, snapshotOf, renderHandOff, frameHandOff } from './handoff.mjs';
import { notify as desktopNotify } from './notify.mjs';
import { DEFAULT_LIMITS, nextFails, assess, transition } from './health.mjs';
import { paletteFrom, derivedSeed } from './palette.mjs';
import { CONNECTORS, connectorSummaries } from '../connectors/index.mjs';
import { RateLimited } from './http-client.mjs';
const KINDS = ['tickets', 'comments', 'prs', 'activity', 'asks', 'runs'];

const stamp = (result, sourceId) => {
  const stamped = { ...result };
  for (const kind of KINDS) {
    stamped[kind] = (result[kind] || []).map((item) => ({ ...item, source: sourceId }));
  }
  return stamped;
};


const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** The header's links: the workspace's own first, then each connector's, minus repeats and minus any connector link to a site an own link already covers. */
export const mergeLinks = (own, derived) => {
  const ownHosts = new Set(own.map((link) => hostOf(link.url)));
  const seen = new Set();
  return [...own, ...derived.filter((link) => !ownHosts.has(hostOf(link.url)))].filter((link) => !seen.has(link.url) && seen.add(link.url));
};

export const createWorkspace = (definition, { dataDir, historyDays, http, secrets, limits = () => DEFAULT_LIMITS, notify = desktopNotify }) => {
  const store = openStore(dataDir, definition.id);
  const rules = compileRules(definition.rules);
  const keyOf = makeKeyFinder(definition.key_pattern);
  const seed = definition.theme?.seed || definition.derived_seed || derivedSeed(definition.id);
  const theme = paletteFrom(seed, definition.theme?.accent);
  const caches = {};
  const listeners = new Set();
  let digest = '';
  let derived = null;
  let marksVersion = 0;
  let freshAt = '';
  const startedAt = nowIso();

  const sources = () => Object.values(store.state.sources);
  const merged = () => Object.fromEntries(KINDS.map((kind) => [kind, sources().flatMap((source) => source[kind] || [])]));
  const me = () => Object.fromEntries(Object.entries(store.state.sources).map(([id, source]) => [id, source.me || '']));
  const ticketUrl = (key) => {
    const base = sources().map((source) => source.ticket_base).find(Boolean);
    return base ? `${base}${key}` : '';
  };

  const noteEvents = () => Object.entries(store.marks.info)
    .filter(([rowId, detail]) => detail.note && store.marks.handled[rowId])
    .map(([rowId, detail]) => ({ id: `note:${rowId}:${store.marks.handled[rowId]}`, at: store.marks.handled[rowId], source: detail.source, key: detail.key, text: detail.note, url: detail.url }));

  const rows = () => {
    const day = nowIso().slice(0, 10);
    if (!derived || derived.version !== store.state.version || derived.day !== day || derived.marksVersion !== marksVersion) {
      const sources = merged();
      const state = { ...sources, events: store.state.events, notes: noteEvents() };
      const context = { me: me(), rules, historyDays, ticketUrl };
      derived = { version: store.state.version, marksVersion, day, turn: turnRows(sources, context), feed: feedRows(state, context) };
    }
    return derived;
  };

  /** Saves the marks and, when what rows() derives from them (a note on a handled row) may have moved, drops the derived rows. */
  const marksChanged = (derivedMoved = true) => {
    if (derivedMoved) {
      marksVersion += 1;
    }
    store.saveMarks();
  };

  const unmark = (rowId) => {
    delete store.marks.handled[rowId];
    delete store.marks.info[rowId];
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
      return { errors: { [entry.id]: `Unknown source type "${entry.type}"` } };
    }
    caches[entry.id] = caches[entry.id] || store.loadCache(entry.id);
    try {
      const result = await connector.poll({ settings: entry, http, secrets, cache: caches[entry.id], sinceIso: daysAgoIso(historyDays), historyDays, keyOf });
      const errors = Object.fromEntries(Object.entries(result.errors || {}).map(([part, message]) => [`${entry.id}.${part}`, message]));
      return { data: stamp(result, entry.id), errors };
    } catch (error) {
      const rateLimited = error instanceof RateLimited;
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
    const turnBefore = rows().turn;
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
    const fresh = ticketsBefore.length ? ticketEvents(ticketsBefore, merged().tickets) : [];
    state.events = [...fresh, ...state.events].slice(0, 500);
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
      recordTrace(turnBefore, fresh);
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

  const rowRef = (row) => ({ key: row.key, source: row.source, url: row.ticket_url || row.url });

  /** Adds the auto Handled mark to rows whose turn passed on in this poll and drops it from rows whose turn came back. */
  const recordTrace = (turnBefore, fresh) => {
    const { turn, feed } = rows();
    const { handled, info } = store.marks;
    let changed = false;
    let notesMoved = false;
    for (const pair of passedRows(turnBefore, turn)) {
      const trace = traceOf(pair, fresh, feed, me());
      if (trace) {
        const rowId = pair.after.row_id;
        notesMoved ||= Boolean(info[rowId]?.note);
        handled[rowId] = [handled[rowId] || '', nowIso(), pair.after.activity_at || ''].sort().pop();
        info[rowId] = { ...info[rowId], ...rowRef(pair.after), auto: true, outcome: trace.outcome, event: trace.event, detail: trace.detail };
        changed = true;
      }
    }
    for (const [rowId, detail] of Object.entries(info)) {
      if (detail.auto && turn.some((row) => row.row_id === rowId && row.group === 'you')) {
        notesMoved ||= Boolean(detail.note);
        unmark(rowId);
        changed = true;
      }
    }
    if (changed) {
      marksChanged(notesMoved);
    }
  };

  const quickLinks = () => mergeLinks(definition.links || [], definition.connectors.flatMap((entry) => (CONNECTORS[entry.type]?.links ? CONNECTORS[entry.type].links(entry) : [])));

  const expireHandled = () => {
    const limit = Date.now() - 7 * DAY;
    let changed = false;
    for (const [rowId, at] of Object.entries(store.marks.handled)) {
      if (new Date(at).getTime() < limit) {
        unmark(rowId);
        changed = true;
      }
    }
    if (changed) {
      marksChanged();
    }
  };

  const identity = () => ({
    id: definition.id, name: definition.name, key_pattern: definition.key_pattern, links: quickLinks(),
    connectors: connectorSummaries(definition.connectors),
    open_moves: myMoves(rows().turn, store.marks).length,
  });

  const describe = () => ({ ...identity(), theme, theme_seed: seed, failing_sources: Object.keys(store.state.errors || {}).length });

  const todosWithLinks = () => store.todos.map((todo) => ({ ...todo, ticket_url: todo.key ? ticketUrl(todo.key) : '' }));

  /** The part of the snapshot a marks write changes: the marks, the rows with their handled flags and the counts. */
  const marked = () => ({ marks: store.marks, turn: withHandled(rows().turn, store.marks), counts: turnCounts(rows().turn, store.marks) });

  const snapshot = (full) => ({
    version: store.state.version, polled_at: store.state.polled_at, errors: store.state.errors, health: health(), me: me(),
    ...marked(), feed: rows().feed, todos: todosWithLinks(), workspace: describe(),
    ...(full ? { ...merged(), events: store.state.events } : {}),
  });

  const handOffSource = () => ({
    data: merged(), turn: rows().turn, feed: rows().feed, workspace: describe(), rules: definition.rules,
    moves: myMoves(rows().turn, store.marks), todos: todosWithLinks().filter((todo) => !todo.done), errors: store.state.errors,
    handled: (row) => isHandled(row, store.marks),
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

  const noteOn = (rowId, text) => {
    const line = oneline(text || '', 200);
    const row = rows().turn.find((candidate) => candidate.row_id === rowId);
    if (!store.marks.handled[rowId] || (!line && !store.marks.info[rowId]?.note)) {
      return;
    }
    const { note, ...rest } = { ...(row ? rowRef(row) : {}), ...store.marks.info[rowId] };
    store.marks.info[rowId] = line ? { ...rest, note: line } : rest;
  };

  const updateMarks = (body) => {
    const marks = store.marks;
    if (body.seen) {
      marks.seen = unionCapped(marks.seen, body.seen);
    }
    if (body.unseen) {
      const drop = new Set(body.unseen);
      marks.seen = marks.seen.filter((id) => !drop.has(id));
    }
    if ('base' in body) {
      marks.base = body.base;
    }
    for (const [rowId, value] of Object.entries(body.handled || {})) {
      if (value === null) {
        unmark(rowId);
      } else {
        marks.handled[rowId] = value;
      }
    }
    for (const [rowId, text] of Object.entries(body.notes || {})) {
      noteOn(rowId, text);
    }
    marksChanged(Object.keys(body.handled || {}).length + Object.keys(body.notes || {}).length > 0);
    emit();
    return marked();
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
