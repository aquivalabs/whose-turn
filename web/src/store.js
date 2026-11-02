// One store for the window: the workspace state the server computed, the window's own choices, and the data flow (load, SSE, marks, to-dos, the config order).
import { shallowReactive, reactive, ref, computed } from 'vue';
import { getJson, post } from './lib/api.js';
import { turnCounts } from './lib/moves.js';
import { orderWorkspaces } from './lib/settings.js';
import { show as showBackdrop } from './backdrop.js';

const remembered = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ } };

// The server's snapshot: replaced wholesale on every load, never mutated in place, so shallow reactivity is enough.
export const S = shallowReactive({ workspaces: [], workspace: { id: '', name: '', connectors: [], links: [], key_pattern: '', theme: null }, turn: [], feed: [], marks: { seen: [], base: 0, handled: {} }, todos: [], errors: {}, problems: [], polled_at: '' });
export const ui = reactive({
  ws: new URLSearchParams(location.search).get('ws') || remembered('wt-ws', ''),
  feed: 'all', feedView: remembered('wt-feed-view', 'ticket'), feedQuery: '', openGroups: new Set(), move: 'open', open: new Set(), showDone: false,
  live: false, status: 'Connecting…', modal: null, feedback: false, settings: false,
});

const DARK = window.matchMedia('(prefers-color-scheme: dark)');
const isDarkNow = () => {
  const root = document.documentElement.classList;
  if (root.contains('force-dark') || root.contains('force-light')) return root.contains('force-dark');
  return DARK.matches;
};
export const dark = ref(isDarkNow());
DARK.addEventListener('change', () => { dark.value = isDarkNow(); });
/** A clock for "ago" texts; ticks once a minute. */
export const now = ref(Date.now());
setInterval(() => { now.value = Date.now(); }, 30000);

/** The workspace palette for the current colour scheme, as the CSS variables App.vue puts on the root. */
export const themeVariables = computed(() => { const t = S.workspace.theme; return t && t.light && t.dark ? t[dark.value ? 'dark' : 'light'] : {}; });
export const counts = computed(() => turnCounts(S.turn, S.marks));
export const alerts = computed(() => [...(S.problems || []), ...Object.entries(S.errors || {}).map(([source, text]) => source + ': ' + text)]);
export const closeSheets = () => { ui.modal = null; ui.settings = false; ui.feedback = false; };

let version = -1;
export const load = () => getJson('/api/state' + (ui.ws ? '?ws=' + encodeURIComponent(ui.ws) : '')).then((j) => {
  if (j.error) { ui.ws = ''; return load(); }
  Object.assign(S, j);
  ui.ws = S.workspace.id;
  ui.status = '';
  showBackdrop({ workspace: S.workspace.id });
  document.title = 'Whose Turn · ' + S.workspace.name;
  return S;
});
export const reload = () => { version = -1; return load(); };

export const connect = () => {
  const es = new EventSource('/api/stream');
  es.onopen = () => { ui.live = true; };
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (S.workspace.id && d.ws !== S.workspace.id) return;
    if (d.version !== version) { version = d.version; load(); } else { S.polled_at = d.polled_at; }
  };
  es.onerror = () => { ui.live = false; ui.status = 'Disconnected from the local server, retrying…'; };
};

export const switchWorkspace = (id) => {
  if (id === S.workspace.id) return;
  ui.ws = id; remember('wt-ws', id);
  ui.open.clear();
  reload();
};
export const setFeedView = (view) => { ui.feedView = view; remember('wt-feed-view', view); };

const refused = (reply, what) => { if (reply && reply.error) { ui.status = what + ': ' + (reply.error.message || 'refused'); return true; } return false; };
const postWs = (url, body) => post(url, { ws: S.workspace.id, ...body });
export const setMarks = (body) => postWs('/api/marks', body).then((marks) => { if (!refused(marks, 'The mark was not saved')) S.marks = marks; });
export const todoAct = (body) => postWs('/api/todos', body).then((list) => { if (!refused(list, 'The to-do was not saved') && Array.isArray(list)) S.todos = list; });
/** Dragging a workspace icon rewrites the config in the new order: the same raw entries, so secrets and caches stay. */
export const reorderWorkspaces = (ids) => getJson('/api/config').then((config) => post('/api/config', { workspaces: orderWorkspaces(config.workspaces, ids), secrets: [] }))
  .then((j) => { if (!refused(j, 'The order was not saved')) reload(); });
export const refresh = () => {
  ui.status = 'Checking now…';
  post('/api/refresh');
  showBackdrop({ workspace: S.workspace.id, seed: Math.floor(Math.random() * 4294967296) });
};
