// The feed's pure logic: unread, search, grouping by ticket. Rendering lives in Feed.vue.
import type { FeedItem, Marks, TurnRow } from './types.ts';

export interface FeedGroup {
  id: string;
  items: FeedItem[];
  newest: string;
  unread: number;
}

const seen = (marks: Pick<Marks, 'seen'>, id: string) =>
  marks.seen instanceof Set ? marks.seen.has(id) : marks.seen.includes(id);
export const isNew = (item: FeedItem, marks: Pick<Marks, 'seen' | 'base'>) =>
  new Date(item.at).getTime() > (marks.base || 0) && !seen(marks, item.id);

export const matchesQuery = (item: FeedItem, query: string) => {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) {
    return true;
  }
  const haystack = [item.ref, item.key, item.kind, item.who, item.text, item.body]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
};

const groupOf = (item: FeedItem) => item.key || item.ref || item.id;

/** One group per ticket, newest first, with its unread count. */
export const groupFeed = (items: FeedItem[], marks: Pick<Marks, 'seen' | 'base'>): FeedGroup[] => {
  const groups = new Map<string, FeedGroup>();
  for (const item of items) {
    const id = groupOf(item);
    const group = groups.get(id) || { id, items: [], newest: item.at, unread: 0 };
    groups.set(id, group);
    group.items.push(item);
    if (item.at > group.newest) {
      group.newest = item.at;
    }
    if (isNew(item, marks)) {
      group.unread += 1;
    }
  }
  return [...groups.values()].sort((first, second) =>
    String(second.newest).localeCompare(String(first.newest)),
  );
};

/** The chip on a feed group head, from every row of the ticket: "your move" while any row on you is open, "handled" once all of them are marked, none otherwise. */
export const moveChip = (rows: TurnRow[]) => {
  const you = rows.filter((row) => row.group === 'you');
  if (!you.length) {
    return '';
  }
  return you.some((row) => !row.handled) ? 'your move' : 'handled';
};

export const toneOf = (kind: string) =>
  /fail|changes/.test(kind) ? 'bad' : /approved|merged/.test(kind) ? 'ok' : '';
export const hasBody = (item: FeedItem) =>
  /comment|approved|changes|mentioned|review requested/.test(item.kind) &&
  String(item.body || '').trim() !== '';
