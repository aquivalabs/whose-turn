/** One workspace's files on disk: state.json (last poll per source), marks.json (seen, handled, notified) and todos.json. */
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

export const openStore = (dataDir, workspaceId) => {
  const dir = join(dataDir, 'workspaces', workspaceId);
  mkdirSync(dir, { recursive: true });
  const files = { state: join(dir, 'state.json'), marks: join(dir, 'marks.json'), todos: join(dir, 'todos.json') };
  const state = { version: 0, errors: {}, polled_at: '', sources: {}, events: [], ...readJson(files.state, {}) };
  const marks = { seen: [], base: null, handled: {}, notified: [], notified_seeded: false, ...readJson(files.marks, {}) };
  if (!marks.base) {
    marks.base = Date.now() - 3 * DAY;
  }
  const todos = readJson(files.todos, []);
  return {
    state,
    marks,
    todos,
    saveState: () => writeJson(files.state, state),
    saveMarks: () => writeJson(files.marks, marks),
    saveTodos: () => writeJson(files.todos, todos),
  };
};
