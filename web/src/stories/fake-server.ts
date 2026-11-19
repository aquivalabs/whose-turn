// docs/mechanisms/storybook.md
import { snapshot } from '@/store.ts';

type Handler = (body: Record<string, unknown>, method: string) => unknown;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const marks: Handler = (body) => {
  const added = (body.seen as string[] | undefined) || [];
  const seen = body.all ? snapshot.feed.map((item) => item.id) : [...new Set([...snapshot.marks.seen, ...added])];
  return { marks: { ...snapshot.marks, seen }, turn: snapshot.turn, counts: snapshot.counts };
};

const routes = new Map<string, Handler>();
let offline = false;

/** Forgets every story's routes and brings the server back; the preview calls it before each story. */
export const resetServer = () => {
  routes.clear();
  routes.set('/api/marks', marks);
  offline = false;
};

/** Answers `path` with `handler(body, method)` for the story being rendered. */
export const answer = (path: string, handler: Handler) => {
  routes.set(path, handler);
};

/** Makes every call to the local server fail as if it were not running. */
export const goOffline = () => {
  offline = true;
};

/** Answers the window's calls to the local server inside Storybook, so no story reaches the network. */
export const installFakeServer = () => {
  const real = window.fetch.bind(window);
  resetServer();
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) {
      return real(input, init);
    }
    if (offline) {
      throw new TypeError('unreachable');
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return json(routes.get(url.pathname)?.(body, (init?.method || 'GET').toUpperCase()) ?? {});
  };
};
