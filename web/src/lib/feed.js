// The feed's pure logic: unread, search, grouping by ticket. Rendering lives in Feed.vue.
export const isNew = (item, marks) => new Date(item.at).getTime() > (marks.base || 0) && !marks.seen.includes(item.id);

export const matchesQuery = (item, query) => {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [item.ref, item.key, item.kind, item.who, item.text, item.body].join(' ').toLowerCase();
  return words.every((word) => hay.includes(word));
};

export const groupOf = (item) => item.key || item.ref || item.id;

/** One group per ticket, newest first, with its unread count. */
export const groupFeed = (items, marks) => {
  const groups = new Map();
  for (const item of items) {
    const id = groupOf(item);
    if (!groups.has(id)) groups.set(id, { id, items: [], newest: item.at, unread: 0 });
    const group = groups.get(id);
    group.items.push(item);
    if (item.at > group.newest) group.newest = item.at;
    if (isNew(item, marks)) group.unread += 1;
  }
  return [...groups.values()].sort((a, b) => String(b.newest).localeCompare(String(a.newest)));
};

export const toneOf = (kind) => (/fail|changes/.test(kind) ? 'bad' : /approved|merged/.test(kind) ? 'ok' : '');
export const hasBody = (item) => /comment|approved|changes|commented|mentioned|review requested/.test(item.kind) && String(item.body || '').trim() !== '';
