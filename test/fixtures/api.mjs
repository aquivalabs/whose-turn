/** Starts the local API on a free port with inert dependencies; `options` overrides any of them. */
import { startApi } from '../../lib/api.mjs';

export const appDir = new URL('../..', import.meta.url).pathname;

/** A registry with no workspace; `extra` overrides its fields. */
export const emptyRegistry = (extra = {}) => ({ workspaces: [], rawWorkspaces: [], problems: [], subscribe: () => () => {}, ...extra });

/** The started server, its port, and `url`/`get`/`post` helpers bound to it. */
export const startTestApi = async (options = {}) => {
  const server = await startApi({ port: 0, appDir, registry: emptyRegistry(), requestPoll: () => {}, saveConfig: async () => {}, secrets: {}, inbox: {}, http: {}, reports: { list: () => [], add: () => {} }, ...options });
  const { port } = server.address();
  const url = (path) => `http://127.0.0.1:${port}${path}`;
  const post = (path, body, headers = {}) => fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { server, port, url, get: (path, init) => fetch(url(path), init), post };
};
