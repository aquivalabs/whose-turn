/** One workspace's files on disk: state.json (last poll per source), marks.json (seen, handled, notified, health alerts already announced), todos.json and cache.json (connector caches that are data). */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DAY } from './text.mjs';

export const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};

export const writeJson = (path, value) => {
  writeFileSync(`${path}.tmp`, JSON.stringify(value));
  renameSync(`${path}.tmp`, path);
};

const CACHE_VERSION = 1;

const encodeCache = (cache, keys) => Object.fromEntries(keys.filter((key) => cache[key] instanceof Map).map((key) => [key, [...cache[key]]]));

const decodeCache = (saved) => Object.fromEntries(Object.entries(saved || {}).filter(([, entries]) => Array.isArray(entries)).map(([key, entries]) => [key, new Map(entries)]));

export const openStore = (dataDir, workspaceId) => {
  const dir = join(dataDir, 'workspaces', workspaceId);
  mkdirSync(dir, { recursive: true });
  const files = { state: join(dir, 'state.json'), marks: join(dir, 'marks.json'), todos: join(dir, 'todos.json'), cache: join(dir, 'cache.json') };
  const state = { version: 0, errors: {}, polled_at: '', fails: {}, sources: {}, events: [], ...readJson(files.state, {}) };
  const marks = { seen: [], base: null, handled: {}, notified: [], notified_seeded: false, health_alerted: [], ...readJson(files.marks, {}) };
  if (!marks.base) {
    marks.base = Date.now() - 3 * DAY;
  }
  const todos = readJson(files.todos, []);
  const saved = readJson(files.cache, {});
  const savedCaches = saved.version === CACHE_VERSION && saved.entries ? saved.entries : {};
  let savedText = '';
  return {
    state,
    marks,
    todos,
    saveState: () => writeJson(files.state, state),
    saveMarks: () => writeJson(files.marks, marks),
    saveTodos: () => writeJson(files.todos, todos),
    loadCache: (entryId) => decodeCache(savedCaches[entryId]),
    /** keysByEntry: entry id → the cache keys that are data; anything else (the token) never reaches disk. */
    saveCaches: (caches, keysByEntry) => {
      const entries = Object.fromEntries(Object.entries(keysByEntry).map(([entryId, keys]) => [entryId, encodeCache(caches[entryId] || {}, keys)]));
      const file = { version: CACHE_VERSION, entries };
      const text = JSON.stringify(file);
      if (text !== savedText) {
        savedText = text;
        writeJson(files.cache, file);
      }
    },
  };
};
