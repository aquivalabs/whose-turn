/** Jira Cloud connector: your tickets by JQL with all comments (ADF turned into text) and the changelog entry for the current status. Token from the secret store. */
import { toIsoUtc, mapLimit } from '../lib/text.mjs';
import { cachedToken } from '../lib/token-cache.mjs';

const DEFAULT_SERVICE = 'whose-turn-jira';

export const contract = 1;
export const id = 'jira';
export const label = 'Jira';
export const capabilities = ['tickets', 'comments'];
export const links = (settings) => (settings.base ? [{ label: 'Jira', url: String(settings.base).replace(/\/$/, '') }] : []);
export const endpointKey = 'base';
export const fields = [
  { key: 'base', label: 'Site', hint: 'https://your-site.atlassian.net', required: true },
  { key: 'email', label: 'Account email', hint: 'the account the API token belongs to', required: true },
  { key: 'token', label: 'API token', hint: 'stored in the secret store, never in the config', secret: { account: 'email', service: 'token_service', default: DEFAULT_SERVICE } },
  { key: 'token_service', label: 'Secret entry', hint: 'name of the secret-store entry; default whose-turn-jira' },
  { key: 'jql', label: 'JQL', hint: 'which tickets to watch; leave empty for the default: tickets you hold, or held in the last 30 days' },
  { key: 'mentions', label: 'Mentions on other tickets', hint: 'also show a ticket that mentions you in a comment though it was never yours, as one Answer row in Your move; on unless set to false', boolean: true, default: true },
];

const SIMPLE_MARKS = { code: '`', strong: '**' };

export const adfToText = (node, meId, meName) => {
  if (!node) {
    return '';
  }
  const type = node.type;
  const children = node.content || [];
  const inner = (separator = '') => children.map((child) => adfToText(child, meId, meName)).join(separator);
  if (type === 'text') {
    let text = node.text || '';
    for (const mark of node.marks || []) {
      if (SIMPLE_MARKS[mark.type]) {
        text = `${SIMPLE_MARKS[mark.type]}${text}${SIMPLE_MARKS[mark.type]}`;
      } else if (mark.type === 'link') {
        const href = (mark.attrs || {}).href || '';
        text = href && href !== text ? `[${text}](${href})` : text;
      }
    }
    return text;
  }
  if (type === 'mention') {
    const attrs = node.attrs || {};
    return attrs.id === meId ? `@${meName}` : attrs.text || '@someone';
  }
  if (type === 'hardBreak') {
    return '\n';
  }
  if (type === 'paragraph') {
    return `${inner()}\n\n`;
  }
  if (type === 'heading') {
    return `${'#'.repeat(Number((node.attrs || {}).level || 2))} ${inner()}\n\n`;
  }
  if (type === 'codeBlock') {
    return `\`\`\`\n${inner()}\n\`\`\`\n\n`;
  }
  if (type === 'blockquote') {
    return `${inner().trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
  }
  if (type === 'bulletList' || type === 'orderedList') {
    return `${children.map((item, index) => `${type === 'orderedList' ? `${index + 1}.` : '-'} ${adfToText(item, meId, meName).trim().replace(/\n\n/g, '\n')}`).join('\n')}\n\n`;
  }
  if (['mediaSingle', 'mediaGroup', 'media', 'mediaInline'].includes(type)) {
    return '[image]';
  }
  if (type === 'inlineCard' || type === 'blockCard') {
    return (node.attrs || {}).url || '';
  }
  if (type === 'emoji') {
    return (node.attrs || {}).text || '';
  }
  return inner();
};

const createApi = (http, base, email, token) => {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return (path, body) => http.fetchJson(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', body, useEtag: false, headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
};

const statusEntered = async (api, cache, key, updated, status) => {
  const cached = cache.get(key);
  if (cached && cached.updated === updated) {
    return cached.info;
  }
  let info = null;
  let start = 0;
  for (;;) {
    const page = await api(`/rest/api/3/issue/${key}/changelog?startAt=${start}&maxResults=100`);
    for (const history of page.values || []) {
      for (const item of history.items || []) {
        if (item.field === 'status' && String(item.toString || '').toLowerCase() === status.toLowerCase()) {
          const at = toIsoUtc(history.created);
          if (!info || at > info.since) {
            info = { since: at, by: (history.author || {}).displayName || '' };
          }
        }
      }
    }
    if (page.isLast !== false || !(page.values || []).length) {
      break;
    }
    start += page.values.length;
  }
  cache.set(key, { updated, info });
  return info;
};

const jiraToken = async (settings, secrets, cache) => {
  const service = settings.token_service || DEFAULT_SERVICE;
  const token = await cachedToken(cache, () => secrets.get(service, settings.email));
  if (!token) {
    throw new Error(`No Jira API token in the secret store (service ${service}, account ${settings.email})`);
  }
  return token;
};

/** The JQL for tickets with a comment that mentions your account id, which Jira indexes; those the main query missed are mention-only. RMA-86. */
export const mentionsJql = (accountId, historyDays = 30) => (/^[\w:-]+$/.test(accountId)
  ? `comment ~ "${accountId}" AND updated >= -${Math.max(1, Math.round(historyDays))}d ORDER BY updated DESC`
  : '');

export const poll = async ({ settings, http, secrets, cache, historyDays }) => {
  const base = String(settings.base).replace(/\/$/, '');
  if (!base.startsWith('https://')) {
    throw new Error('jira.base must start with https://');
  }
  const api = createApi(http, base, settings.email, await jiraToken(settings, secrets, cache));
  cache.me ??= await api('/rest/api/3/myself');
  const meId = cache.me.accountId;
  const meName = cache.me.displayName || 'me';
  const jql = settings.jql || '(assignee = currentUser() AND statusCategory != Done) OR (assignee was currentUser() AND updated >= -30d) ORDER BY updated DESC';
  const search = (query) => api('/rest/api/3/search/jql', { jql: query, maxResults: 100, fields: ['summary', 'status', 'assignee', 'updated', 'comment'] });
  const mentionQuery = settings.mentions === false ? '' : mentionsJql(meId, historyDays);
  const errors = {};
  const [result, mentioned] = await Promise.all([
    search(jql),
    mentionQuery ? search(mentionQuery).then((found) => found.issues || [], (error) => { errors.mentions = `${error.name}: ${error.message}`; return []; }) : [],
  ]);
  const held = new Set((result.issues || []).map((issue) => issue.key));
  const tickets = [];
  const comments = [];
  for (const issue of [...(result.issues || []), ...mentioned.filter((issue) => !held.has(issue.key))]) {
    const fields = issue.fields;
    const url = `${base}/browse/${issue.key}`;
    tickets.push({
      key: issue.key, summary: fields.summary || '', status: (fields.status || {}).name || '', status_category: ((fields.status || {}).statusCategory || {}).key || '',
      assignee: (fields.assignee || {}).displayName || 'Unassigned', updated: fields.updated || '', url,
      ...(held.has(issue.key) ? {} : { mention_only: true }),
    });
    for (const comment of ((fields.comment || {}).comments || [])) {
      const body = comment.body;
      comments.push({
        id: comment.id, key: issue.key, at: toIsoUtc(comment.created), author: (comment.author || {}).displayName || '',
        body: body && typeof body === 'object' ? adfToText(body, meId, meName).trim() : String(body || ''), url: `${url}?focusedCommentId=${comment.id}`,
      });
    }
  }
  cache.statusEntered ??= new Map();
  await mapLimit(tickets.filter((ticket) => ticket.status_category !== 'done' && !ticket.mention_only), 4, async (ticket) => {
    try {
      ticket.status_change = await statusEntered(api, cache.statusEntered, ticket.key, ticket.updated, ticket.status);
    } catch (error) {
      ticket.status_change = null;
      errors.changelog = `${error.name}: ${error.message}`;
    }
  });
  return { me: meName, tickets, comments, ticket_base: `${base}/browse/`, errors };
};
