/** Local file connector: tickets from a Markdown task list or a JSON file on this machine. No network, no secret. See docs/mechanisms/connector-contract.md. */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { toIsoUtc, expandHome } from '../lib/text.mjs';
import { Adapter } from '../lib/adapter.mjs';

const FIELDS = [
  { key: 'path', label: 'File', hint: 'a .md task list or a .json list of tickets; ~ is your home directory', required: true },
  { key: 'me', label: 'Your name', hint: 'how the file names you as an assignee; default me' },
];

const DONE = /^(done|closed|complete|completed)$/i;
const NOT_STARTED = /^(backlog|to ?do|todo|open|new)$/i;
const TASK = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/;
const HEADING = /^#{2,6}\s+(.+?)\s*$/;
const ASSIGNEE = /(?:^|\s)@([\w.-]+)/;

/** A key for an item that names none: F- and six hex digits of its title, stable while the title is. */
const derivedKey = (title) => `F-${createHash('sha1').update(title).digest('hex').slice(0, 6)}`;

/** @type {(status: string, done: boolean) => import('../types/connector.js').Ticket['status_category']} */
const categoryOf = (status, done) => {
  if (done || DONE.test(status)) {
    return 'done';
  }
  return NOT_STARTED.test(status) ? 'new' : 'indeterminate';
};

/** Markdown: `- [ ]` and `- [x]` items; the nearest `##` (or deeper) heading above an open item is its status, the `#` title is not, `@name` assigns it to someone else. */
export const parseMarkdown = (source, { keyOf, me }) => {
  const items = [];
  let heading = 'To Do';
  for (const line of source.split('\n')) {
    const title = HEADING.exec(line);
    if (title) {
      heading = title[1];
      continue;
    }
    const task = TASK.exec(line);
    if (task) {
      const done = task[1] !== ' ';
      const summary = task[2].replace(ASSIGNEE, ' ').replace(/\s+/g, ' ').trim();
      items.push({ key: keyOf(summary) || derivedKey(summary), summary, status: done ? 'Done' : heading, done, assignee: ASSIGNEE.exec(task[2])?.[1] || me, updated: '', url: '' });
    }
  }
  return items;
};

/** JSON: a list of tickets, or `{ tickets: [...] }`; each needs a summary (or a title) and may carry key, status, assignee, updated, url and done. */
export const parseJson = (source, { keyOf, me }) => {
  const parsed = JSON.parse(source);
  const list = Array.isArray(parsed) ? parsed : parsed?.tickets;
  if (!Array.isArray(list)) {
    throw new Error('a JSON tickets file must be a list or an object with a "tickets" list');
  }
  return list.filter((entry) => entry && (entry.summary || entry.title)).map((entry) => {
    const summary = String(entry.summary || entry.title);
    return {
      key: String(entry.key || keyOf(summary) || derivedKey(summary)), summary, status: String(entry.status || (entry.done ? 'Done' : 'To Do')), done: Boolean(entry.done),
      assignee: String(entry.assignee || me), updated: entry.updated ? toIsoUtc(entry.updated) : '', url: /^https:\/\//.test(entry.url || '') ? entry.url : '',
    };
  });
};

/** An item keeps the time it was first seen in its current form, so saving the file does not touch every ticket. */
const rememberUpdated = (cache, item, fallback) => {
  const signature = `${item.summary}\n${item.status}\n${item.assignee}`;
  const seen = cache.seen.get(item.key);
  const at = item.updated || (seen && seen.signature === signature ? seen.at : fallback);
  cache.seen.set(item.key, { signature, at });
  return at;
};

const poll = async ({ settings, cache, keyOf }) => {
  const path = expandHome(settings.path);
  const me = String(settings.me || 'me');
  const [source, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]).catch((error) => {
    throw new Error(`Cannot read ${settings.path}: ${error.code === 'ENOENT' ? 'no such file' : error.message}`);
  });
  const items = (/\.json$/i.test(path) ? parseJson : parseMarkdown)(source, { keyOf, me });
  cache.seen = cache.seen || new Map();
  const modified = toIsoUtc(info.mtime);
  const tickets = items.map((item) => ({
    key: item.key, summary: item.summary, status: item.status, status_category: categoryOf(item.status, item.done), assignee: item.assignee,
    updated: rememberUpdated(cache, item, modified), url: item.url, status_change: null,
  }));
  const keys = new Set(tickets.map((ticket) => ticket.key));
  for (const key of [...cache.seen.keys()].filter((candidate) => !keys.has(candidate))) {
    cache.seen.delete(key);
  }
  return { me, tickets, errors: /** @type {Record<string, string>} */ ({}) };
};

/** The local file source under connector contract 1, offered only through the config for now. */
class LocalFile extends Adapter {
  contract = 1;
  id = 'file';
  label = 'Local file';
  capabilities = ['tickets'];
  fields = FIELDS;
  persistedCache = ['seen'];
  experimental = true;
  reportable = false;

  poll(context) {
    return poll(context);
  }
}

export default new LocalFile();
