// docs/mechanisms/storybook.md
import { snapshot } from '@/store.ts';
import type { Todo } from '@/lib/types.ts';

/** Answers one call: its JSON body, its method and its URL. */
export type Handler = (body: Record<string, unknown>, method: string, url: URL) => unknown;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const marks: Handler = (body) => {
  const { seen = [], all, handled = {}, notes = {} } = body as {
    seen?: string[];
    all?: true;
    handled?: Record<string, string | null>;
    notes?: Record<string, string>;
  };
  const next = structuredClone(snapshot.marks);
  next.seen = all ? snapshot.feed.map((item) => item.id) : [...new Set([...next.seen, ...seen])];
  Object.entries(handled).forEach(([id, stamp]) => {
    next.handled[id] = stamp;
    if (!stamp) {
      delete next.info[id];
    }
  });
  Object.entries(notes).forEach(([id, note]) => {
    next.info[id] = { ...next.info[id], note };
  });
  const turn = snapshot.turn.map((row) => ({ ...row, handled: Boolean(next.handled[row.row_id]) }));
  return { marks: next, turn, counts: snapshot.counts };
};

let todos: Todo[] | null = null;
const todo: Handler = (body) => {
  const { action, id, text } = body as { action?: string; id?: string; text?: string };
  const stamp = new Date().toISOString();
  let list = todos ?? structuredClone(snapshot.todos);
  if (action === 'add') {
    list = [{ id: `n${list.length + 1}`, text: text || '', done: null, created: stamp }, ...list];
  } else if (action === 'done' || action === 'undo') {
    list = list.map((item) => (item.id === id ? { ...item, done: action === 'done' ? stamp : null } : item));
  } else if (action === 'edit') {
    list = list.map((item) => (item.id === id ? { ...item, text: text || item.text } : item));
  } else if (action === 'delete') {
    list = list.filter((item) => item.id !== id);
  }
  todos = list;
  return list;
};

const routes = new Map<string, Handler>();
let offline = false;

/** Brings back the default routes (marks, to-dos, an empty changelog) and the server; the preview calls it before each story. */
export const resetServer = () => {
  routes.clear();
  routes.set('/api/marks', marks);
  routes.set('/api/todos', todo);
  routes.set('/api/changelog', () => ({ versions: [] }));
  todos = null;
  offline = false;
};

/** Answers `path` with `handler` for the story being rendered. */
export const answer = (path: string, handler: Handler) => {
  routes.set(path, handler);
};

/** Makes every call to the local server fail as if it were not running. */
export const goOffline = () => {
  offline = true;
};

const realFetch = window.fetch.bind(window);

/** Answers the window's calls to the local server inside Storybook, so no story reaches the network. */
export const installFakeServer = () => {
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) {
      return realFetch(input, init);
    }
    if (offline) {
      throw new TypeError('unreachable');
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return json(routes.get(url.pathname)?.(body, (init?.method || 'GET').toUpperCase(), url) ?? {});
  };
};
