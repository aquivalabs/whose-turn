/** The hand-off queue: what the user gave to an agent from the window, kept in <data>/inbox.json until each consumer has taken it once. */
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from './store.mjs';
import { nowIso, DAY } from './text.mjs';

export const MARKER = 'inbox.pending';

export const openInbox = (dataDir) => {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'inbox.json');
  const marker = join(dataDir, MARKER);
  let items = readJson(file, []).filter((item) => item && item.delivered && typeof item.delivered === 'object');

  const save = () => {
    writeJson(file, items);
    if (items.length) {
      writeFileSync(marker, String(items.length));
    } else {
      try {
        unlinkSync(marker);
      } catch {
        /* already gone */
      }
    }
  };

  const expired = (item) => {
    const first = Object.values(item.delivered).sort()[0];
    return (first && Date.now() - new Date(first).getTime() > DAY) || Date.now() - new Date(item.at).getTime() > 7 * DAY;
  };

  const pending = (consumer) => items.filter((item) => !consumer || !item.delivered[consumer]);

  return {
    add: ({ ws, ws_name, kind, ref, snapshot }) => {
      const entry = { id: randomUUID(), at: nowIso(), delivered: {}, ws, ws_name, kind, ref, snapshot };
      items = [...items.filter((existing) => existing.ws !== ws || existing.kind !== kind || existing.ref !== ref), entry].slice(-200);
      save();
      return entry;
    },
    pending,
    take: (consumer) => {
      const taken = pending(consumer);
      const stamp = nowIso();
      taken.forEach((item) => { item.delivered[consumer] = stamp; });
      const before = items.length;
      items = items.filter((item) => !expired(item));
      if (taken.length || items.length !== before) {
        save();
      }
      return taken;
    },
    clear: () => {
      items = [];
      save();
    },
  };
};
