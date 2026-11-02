/** The hand-off queue: items the user gave to Claude from the window, kept in <data>/inbox.json until a session or an MCP client takes them. */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './text.mjs';

export const openInbox = (dataDir) => {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'inbox.json');
  let items = [];
  try {
    items = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    items = [];
  }
  const save = () => {
    writeFileSync(`${file}.tmp`, JSON.stringify(items));
    renameSync(`${file}.tmp`, file);
  };
  return {
    add: (item) => {
      const entry = { id: `i${Date.now()}${Math.floor(Math.random() * 1000)}`, at: nowIso(), delivered: null, ...item };
      items = [...items.filter((existing) => existing.delivered || existing.ws !== entry.ws || existing.kind !== entry.kind || existing.ref !== entry.ref), entry].slice(-200);
      save();
      return entry;
    },
    pending: () => items.filter((item) => !item.delivered),
    take: () => {
      const taken = items.filter((item) => !item.delivered);
      const stamp = nowIso();
      taken.forEach((item) => { item.delivered = stamp; });
      items = items.filter((item) => !item.delivered || Date.now() - new Date(item.delivered).getTime() < 7 * 86400000);
      save();
      return taken;
    },
    clear: () => {
      items = [];
      save();
    },
  };
};
