/** Files a bug or an improvement about the monitor through the maintainer's relay and reads back what became of it. A report carries the kind, title, text, version and a technical environment, nothing else. RMA-104, RMA-280, RMA-291. */
import { release } from 'node:os';
import { join, sep } from 'node:path';
import { readJson, writeJson } from './store.mjs';
import { hostOf, isObject, nowIso } from './text.mjs';
import { ApiError } from './errors.mjs';
import { RateLimited } from './http-client.mjs';

export const RELAY_URL = 'https://6cd7q2274i726zmnyav22ar2lu0fangt.lambda-url.eu-central-1.on.aws/';
const PRODUCT = 'whose-turn';
export const installOf = (appDir) => (appDir.split(sep).includes('node_modules') ? 'npm' : 'source');
const MAX_IDS = 50;
const READ_TOKEN = /^[A-Za-z0-9_-]{22}$/;
export const MAX_BODY_CHARS = 6000;
export const NEWS_EVERY_MS = 10 * 60 * 1000;
const STATE_NAMES = { open: 'Open', ready: 'Fixed, coming in the next release', done: 'Done', dropped: 'Dropped' };

const failureOf = (error) => {
  const failure = error instanceof RateLimited
    ? new ApiError('RATE_LIMITED')
    : error.upstreamStatus === 400
      ? new ApiError('INVALID_ARGUMENT', { detail: 'the tracker refused the report' })
      : new ApiError('UPSTREAM_FAILED', error.upstreamStatus ? { upstream_status: error.upstreamStatus } : {});
  failure.debug = String(error.message);
  return failure;
};

/** True when the relay refused the report only because it does not know `diagnostics` yet. RMA-383. */
export const refusesDiagnostics = (error) => {
  if (error?.upstreamStatus !== 400) {
    return false;
  }
  try {
    const answer = JSON.parse(error.upstreamBody || '');
    return answer.code === 'unexpected_field' && /Field: diagnostics\./.test(String(answer.message));
  } catch {
    return false;
  }
};

const send = async (http, url, payload) => {
  const post = (body) => http.fetchJson(url, { method: 'POST', body, useEtag: false, keepBody: true });
  try {
    return await post(payload);
  } catch (error) {
    if (!payload.diagnostics || !refusesDiagnostics(error)) {
      throw failureOf(error);
    }
  }
  const { diagnostics, ...bare } = payload;
  return post(bare).catch((error) => {
    throw failureOf(error);
  });
};

const isSize = (value) => Number.isInteger(value) && value >= 1 && value <= 20000;
const hundreds = (value) => Math.max(100, Math.round(value / 100) * 100);

/** A time zone as its whole-hour UTC offset in `Etc/GMT` form, or undefined for a half-hour zone or a name Node does not know. */
export const utcOffsetZone = (zone, at = new Date()) => {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value || '';
    const match = /^GMT(?:([+-])(\d{1,2}))?$/.exec(name);
    if (!match) {
      return undefined;
    }
    const hours = Number(match[2] || 0);
    return hours === 0 ? 'Etc/GMT' : `Etc/GMT${match[1] === '+' ? '-' : '+'}${hours}`;
  } catch {
    return undefined;
  }
};

/** The OS release cut to its major number, or the raw release when it does not start with one. */
export const osMajor = (raw) => /^\d+/.exec(raw)?.[0] || raw;

const BROWSERS = ['Chrome', 'Edge', 'Safari', 'Firefox', 'Opera', 'Brave', 'Arc', 'Chromium', 'Other'];
const exactly = (value, keys) => isObject(value) && Object.keys(value).sort().join() === keys;

const CLIENT_FIELDS = {
  browser: (value) => (exactly(value, 'name,version') && BROWSERS.includes(value.name) && typeof value.version === 'string' && /^\d{1,6}$/.test(value.version) ? { name: value.name, version: value.version } : undefined),
  display: (value) => {
    const sane = exactly(value, 'height,scale,viewport,width') && isSize(value.width) && isSize(value.height) && typeof value.scale === 'number' && value.scale >= 0.5 && value.scale <= 8 && Array.isArray(value.viewport) && value.viewport.length === 2 && value.viewport.every(isSize);
    return sane ? { width: hundreds(value.width), height: hundreds(value.height), scale: Math.round(value.scale * 100) / 100, viewport: value.viewport.map(hundreds) } : undefined;
  },
  locale: (value) => (typeof value === 'string' && value.length <= 35 && /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(value) ? value : undefined),
  timezone: (value) => (typeof value === 'string' && value.length <= 64 ? utcOffsetZone(value) : undefined),
  theme: (value) => (value === 'light' || value === 'dark' ? value : undefined),
  mode: (value) => (value === 'app' || value === 'tab' ? value : undefined),
};

/** What the window reported about itself, keeping only the fields that are exactly the agreed shape; a bad or missing one is left out, never an error. RMA-291. */
export const clientOf = (client) => {
  const clean = {};
  for (const [key, check] of Object.entries(CLIENT_FIELDS)) {
    const value = isObject(client) ? check(client[key]) : undefined;
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
};

const environmentOf = ({ sources, install, client }) => ({ os: process.platform, osVersion: osMajor(release()), arch: process.arch, node: process.version.split('.').slice(0, 2).join('.'), install, sources: [...new Set(sources)].sort(), ...clientOf(client) });

/** The exact body a report would carry to the relay, built without sending it. README.md § API, POST /api/feedback. */
export const reportPayload = ({ version, sources = [], install = 'source', client = null, diagnostics = null }, { kind = undefined, title = undefined, body = undefined } = {}) => ({
  product: PRODUCT, kind, title, body, version: version || undefined, environment: environmentOf({ sources, install, client }), ...(diagnostics && Object.keys(diagnostics).length ? { diagnostics } : {}),
});

/** True when the admin token may go to this relay: the built-in one, or a host the caller allow-listed. */
export const mayReceiveAdminToken = (relayUrl, adminHosts = []) => {
  if (relayUrl === RELAY_URL) {
    return true;
  }
  const host = hostOf(relayUrl);
  return host !== '' && adminHosts.includes(host);
};

/** The reports this machine filed and what became of them on the relay: states(), detail(), markSeen(), checkNews(); with an admin token, every user report. README.md § API. RMA-120, RMA-123, RMA-306, RMA-311. */
export const openReports = (dataDir, { http, relayUrl, adminToken = async () => '', adminHosts = [] }) => {
  const file = join(dataDir, 'reports.json');
  let items = readJson(file, []);
  const seenFile = join(dataDir, 'reports-seen.json');
  let seen = readJson(seenFile, null);
  let cached = null;
  let news = false;
  const listeners = new Set();
  // README § API, GET /api/feedback
  let lookup = null;
  const mayAsk = mayReceiveAdminToken(relayUrl, adminHosts);
  const readAll = async () => {
    if (!mayAsk) {
      return null;
    }
    lookup ||= adminToken();
    const token = await lookup;
    if (!token) {
      return null;
    }
    try {
      const answer = await http.fetchJson(`${relayUrl}?product=${PRODUCT}&all=1`, { useEtag: false, headers: { Authorization: `Bearer ${token}` } });
      return answer.issues || [];
    } catch (error) {
      if (error.upstreamStatus === 401) {
        lookup = null;
      }
      return null;
    }
  };
  const readOwn = async () => {
    if (!items.length) {
      return [];
    }
    try {
      const ids = items.slice(0, MAX_IDS).map((report) => (READ_TOKEN.test(report.read_token || '') ? `${report.id}:${report.read_token}` : report.id)).join(',');
      return (await http.fetchJson(`${relayUrl}?product=${PRODUCT}&ids=${encodeURIComponent(ids)}`, { useEtag: false })).issues || [];
    } catch {
      return [];
    }
  };
  const live = async (maxAge = 60000) => {
    if (cached && Date.now() - cached.at < maxAge) {
      return cached.value;
    }
    const all = await readAll();
    const issues = all || await readOwn();
    cached = { at: Date.now(), value: { admin: Boolean(all), issues: Object.fromEntries(issues.map((issue) => [issue.identifier, issue])), order: issues.map((issue) => issue.identifier) } };
    return cached.value;
  };
  const shape = (issues) => Object.fromEntries(Object.values(issues).map((issue) => [issue.identifier, { state: issue.outcome, answers: (issue.answers || []).length }]));
  const differs = (now) => Object.entries(now).some(([id, shown]) => !seen[id] || seen[id].state !== shown.state || seen[id].answers !== shown.answers);
  const setNews = (value) => {
    if (value !== news) {
      news = value;
      listeners.forEach((listener) => listener({ report_news: news }));
    }
  };
  const merged = (report, issue) => (issue ? { ...report, title: issue.title || report.title, state: STATE_NAMES[issue.outcome] || issue.outcome, outcome: issue.outcome, changed_at: issue.updatedAt } : report);
  const strangers = (id, issue) => merged({ id, title: issue.title, filed_at: issue.updatedAt }, issue);
  return {
    relayUrl,
    list: () => items.slice(),
    hasNews: () => news,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    /** The background look: reuses a read younger than ten minutes, so a closed sheet costs the relay one call per ten minutes; the first look only records what is there. */
    checkNews: async () => {
      const now = shape((await live(NEWS_EVERY_MS)).issues);
      if (!seen) {
        seen = now;
        writeJson(seenFile, seen);
      }
      setNews(differs(now));
      return news;
    },
    /** The sheet showed these reports: remember their state and answer count, and calm the button down. A failed read keeps what was remembered. */
    markSeen: async () => {
      const next = { ...seen, ...shape((await live()).issues) };
      if (JSON.stringify(next) !== JSON.stringify(seen)) {
        seen = next;
        writeJson(seenFile, seen);
      }
      setNews(false);
    },
    add: (report) => { items = [report, ...items].slice(0, 100); cached = null; writeJson(file, items); return report; },
    states: async () => {
      const { admin, issues, order } = await live();
      if (!admin) {
        return items.map((report) => merged(report, issues[report.id]));
      }
      const own = new Map(items.map((report) => [report.id, report]));
      return order.map((id) => ({ ...(own.has(id) ? merged(own.get(id), issues[id]) : strangers(id, issues[id])), mine: own.has(id) }));
    },
    detail: async (id) => {
      const { admin, issues } = await live();
      const issue = issues[id];
      const report = items.find((item) => item.id === id) || (admin && issue ? strangers(id, issue) : null);
      if (!report) {
        return null;
      }
      const hidden = Boolean(issue) && !Array.isArray(issue.answers);
      const answers = (issue && !hidden ? issue.answers : []).map((answer) => ({ at: answer.at, by: answer.author || '', text: answer.body })).sort((a, b) => a.at.localeCompare(b.at));
      const shown = merged(report, issue);
      return { ...shown, answers, answers_hidden: hidden, unanswered: !hidden && (shown.outcome === 'done' || shown.outcome === 'dropped') && !answers.length };
    },
  };
};

const refuseUnsafe = async (parts, mentionsSecret) => {
  for (const [field, value] of Object.entries(parts)) {
    if (typeof value === 'string' && value.length > MAX_BODY_CHARS) {
      throw new ApiError('INVALID_ARGUMENT', { detail: `${field} is too long` }, [{ field, description: `Keep it to ${MAX_BODY_CHARS} characters or fewer.` }]);
    }
  }
  if (await mentionsSecret(Object.values(parts).filter((value) => typeof value === 'string'))) {
    throw new ApiError('INVALID_ARGUMENT', { detail: 'the report contains a stored secret' }, [{ field: 'text', description: 'The report contains a value kept in the secret store; remove it. Nothing was sent.' }]);
  }
};

/**
 * Files a report; returns {identifier, url, title, composed_by}.
 * `text` goes through `compose(text)` first.
 * Refusals: README.md § API, POST /api/feedback.
 */
export const createFeedback = async ({ http, relayUrl, reports, version, sources = [], install = 'source', client = null, diagnostics = null, mentionsSecret, compose }, { kind, title, body = '', text = '', from = 'caller' }) => {
  await refuseUnsafe({ text, title, body }, mentionsSecret);
  const shaped = text ? await compose(text) : { kind, title, body, composed_by: from };
  const cleanTitle = String(shaped.title || '').trim().slice(0, 140);
  if (!cleanTitle) {
    throw new ApiError('INVALID_ARGUMENT', { detail: 'a title is required' }, [{ field: 'title', description: 'A report needs a title.' }]);
  }
  const clean = String(shaped.body || '').trim().slice(0, MAX_BODY_CHARS);
  const kindOf = shaped.kind || 'improvement';
  const issue = await send(http, relayUrl, reportPayload({ version, sources, install, client, diagnostics }, { kind: kindOf, title: cleanTitle, body: clean || cleanTitle }));
  if (reports) {
    reports.add({ id: issue.identifier, url: issue.url, title: cleanTitle, kind: kindOf, body: clean, filed_at: nowIso(), ...(READ_TOKEN.test(issue.readToken || '') ? { read_token: issue.readToken } : {}) });
  }
  return { identifier: issue.identifier, url: issue.url, title: cleanTitle, composed_by: shaped.composed_by };
};
