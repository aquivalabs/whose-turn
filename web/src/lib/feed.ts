// The feed's pure logic: unread, search, grouping by ticket, source badges. Rendering lives in Feed.vue.
import type { ConnectorSummary, FeedItem, Marks, TurnRow } from './types.ts';
import { glyphOf } from './icons.ts';

export interface FeedGroup {
  id: string;
  items: FeedItem[];
  newest: string;
  unread: number;
  title: string;
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
  const haystack = [item.ref, item.key, item.title, item.kind, item.who, item.text, item.body]
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
    const group = groups.get(id) || { id, items: [], newest: item.at, unread: 0, title: '' };
    groups.set(id, group);
    group.items.push(item);
    group.title ||= item.title || '';
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

/** The tickets whose feed group carries the "your move" bar: any row of the ticket on you and not yet handled. */
export const moveKeys = (rows: TurnRow[]) =>
  new Set(rows.filter((row) => row.group === 'you' && !row.handled).map((row) => row.key));

/** The kinds of a group's events for its one-line head: the first `shown` distinct kinds, then "+n" for the rest. */
export const kindsLabel = (items: Pick<FeedItem, 'kind'>[], shown = 2) => {
  const kinds = [...new Set(items.map((item) => item.kind))];
  const rest = kinds.length - shown;
  return kinds.slice(0, shown).join(' · ') + (rest > 0 ? ` +${rest}` : '');
};

export const toneOf = (kind: string) =>
  /fail|changes/.test(kind) ? 'bad' : /approved|merged|passed/.test(kind) ? 'ok' : '';
export const hasBody = (item: FeedItem) =>
  /comment|approved|changes|mentioned|review requested/.test(item.kind) &&
  String(item.body || '').trim() !== '';

/** What a PR item is about: its ticket key, else its title; empty for a ticket item, whose reference is the key (RMA-167). */
export const subjectOf = (item: FeedItem) =>
  item.ref !== item.key ? item.key || item.title || '' : '';

/** The collapsed line under an item: the subject, then the text, without repeating a text that is the title itself. */
export const itemLine = (item: FeedItem) =>
  [subjectOf(item), item.text === item.title ? '' : item.text].filter(Boolean).join(' · ');

/** The source badge: the badge the connector's type declares, else the initials of the connector's label, as the rail does for workspaces (RMA-137, RMA-167, RMA-429). */
export const badgeOf = (source: ConnectorSummary) => source.badge || glyphOf(source.label);

/** Each source's badge by id: none with a single source, and badges that would repeat fall back to the label's initials, then get a number. RMA-450. */
export const badgesFor = (sources: ConnectorSummary[]): Record<string, string> => {
  if (sources.length < 2) {
    return {};
  }
  const count = (list: string[], value: string) => list.filter((entry) => entry === value).length;
  const own = sources.map(badgeOf);
  const first = sources.map((source, index) => (count(own, own[index]) > 1 ? glyphOf(source.label) : own[index]));
  return Object.fromEntries(
    sources.map((source, index) => {
      const badge = first[index];
      return [source.id, count(first, badge) > 1 ? `${badge.slice(0, 1)}${count(first.slice(0, index), badge) + 1}` : badge];
    }),
  );
};
