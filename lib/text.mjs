/** Small text and time helpers shared by connectors, rules and the store. */

export const DAY = 86400000;

export const toIsoUtc = (value) => {
  const time = new Date(value || '').getTime();
  return Number.isFinite(time) ? new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
};

export const nowIso = () => toIsoUtc(Date.now());

export const daysAgoIso = (days) => toIsoUtc(Date.now() - days * DAY);

export const oneline = (text, limit = 140) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
};

/** True for a plain object: not null, not an array. */
export const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const wordsRegex = (words, flags = 'i') => new RegExp(words.length ? words.map(escapeRegex).join('|') : '(?!)', flags);

export const makeKeyFinder = (pattern) => {
  const regex = new RegExp(pattern);
  return (text) => {
    const match = regex.exec(text || '');
    return match ? match[0] : '';
  };
};

export const newestFirst = (list) => list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));

export const unionCapped = (list, additions, cap = 5000) => [...new Set([...list, ...additions])].slice(-cap);

export const mapLimit = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};
