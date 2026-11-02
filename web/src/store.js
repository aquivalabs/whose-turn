// One reactive store for the window: the workspace state the server computed, the window's own choices, and the data flow (load, SSE, marks, to-dos).
import { reactive } from 'vue';
import { getJson, post } from './lib/api.js';

const remembered = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ } };

export const S = reactive({ loaded: false, workspaces: [], workspace: { id: '', name: '', connectors: [], links: [], key_pattern: '' }, turn: [], feed: [], marks: { seen: [], base: 0, handled: {} }, todos: [], errors: {}, problems: [], polled_at: '' });
export const ui = reactive({
  ws: new URLSearchParams(location.search).get('ws') || remembered('wt-ws', ''),
  feed: 'all', feedView: remembered('wt-feed-view', 'ticket'), feedQuery: '', openGroups: new Set(), move: 'open', open: new Set(), showDone: false,
  live: false, status: 'Connecting…', theme: null, tick: 0,
  modal: null, feedback: false, settings: false,
});
setInterval(() => { ui.tick += 1; }, 10000);

const DARK = window.matchMedia('(prefers-color-scheme: dark)');
export const isDark = () => {
  const root = document.documentElement.classList;
  if (root.contains('force-dark') || root.contains('force-light')) return root.contains('force-dark');
  return DARK.matches;
};
/** The workspace palette for the current colour scheme, as the CSS variables App.vue puts on the root. */
export const themeVariables = () => (ui.theme && ui.theme.light && ui.theme.dark ? ui.theme[isDark() ? 'dark' : 'light'] : {});
DARK.addEventListener('change', () => { ui.tick += 1; });

let version = -1;
export const load = () => getJson('/api/state' + (ui.ws ? '?ws=' + encodeURIComponent(ui.ws) : '')).then((j) => {
  if (j.error) { ui.ws = ''; return load(); }
  Object.assign(S, j, { loaded: true });
  ui.status = '';
  ui.ws = S.workspace.id;
  ui.theme = S.workspace.theme || null;
  if (window.whoseTurnBackdrop) window.whoseTurnBackdrop.show({ workspace: S.workspace.id });
  document.title = 'Whose Turn · ' + S.workspace.name;
  return S;
});
export const reload = () => { version = -1; return load(); };

export const connect = () => {
  const es = new EventSource('/api/stream');
  es.onopen = () => { ui.live = true; };
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (S.loaded && d.ws !== S.workspace.id) return;
    if (d.version !== version) { version = d.version; load(); }
    else { S.polled_at = d.polled_at; ui.tick += 1; }
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

export const postWs = (url, body) => post(url, { ws: S.workspace.id, ...body });
const refused = (reply, what) => { if (reply && reply.error) { ui.status = what + ': ' + (reply.error.message || 'refused'); return true; } return false; };
export const setMarks = (body) => postWs('/api/marks', body).then((marks) => { if (!refused(marks, 'The mark was not saved')) S.marks = marks; });
export const todoAct = (body) => postWs('/api/todos', body).then((list) => { if (!refused(list, 'The to-do was not saved') && Array.isArray(list)) S.todos = list; });
export const refresh = () => {
  ui.status = 'Checking now…';
  post('/api/refresh');
  if (window.whoseTurnBackdrop) window.whoseTurnBackdrop.show({ workspace: S.workspace.id, seed: Math.floor(Math.random() * 4294967296) });
};
