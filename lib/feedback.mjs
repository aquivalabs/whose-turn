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
export const NEWS_EVERY_MS = 10 * 60 * 1000;
const STATE_NAMES = { open: 'Open', ready: 'Fixed, coming in the next release', done: 'Done', dropped: 'Dropped' };

const call = async (http, url, options) => {
  try {
    return await http.fetchJson(url, { ...options, useEtag: false });
  } catch (error) {
    const failure = error instanceof RateLimited
      ? new ApiError('RATE_LIMITED')
      : error.upstreamStatus === 400
        ? new ApiError('INVALID_ARGUMENT', { detail: 'the tracker refused the report' })
        : new ApiError('UPSTREAM_FAILED', error.upstreamStatus ? { upstream_status: error.upstreamStatus } : {});
    failure.debug = String(error.message);
    throw failure;
  }
};

const isSize = (value) => Number.isInteger(value) && value >= 1 && value <= 20000;
const BROWSERS = ['Chrome', 'Edge', 'Safari', 'Firefox', 'Opera', 'Brave', 'Arc', 'Chromium', 'Other'];
const exactly = (value, keys) => isObject(value) && Object.keys(value).sort().join() === keys;

const CLIENT_FIELDS = {
  browser: (value) => (exactly(value, 'name,version') && BROWSERS.includes(value.name) && typeof value.version === 'string' && /^\d{1,6}$/.test(value.version) ? { name: value.name, version: value.version } : undefined),
  display: (value) => {
    const sane = exactly(value, 'height,scale,viewport,width') && isSize(value.width) && isSize(value.height) && typeof value.scale === 'number' && value.scale >= 0.5 && value.scale <= 8 && Array.isArray(value.viewport) && value.viewport.length === 2 && value.viewport.every(isSize);
    return sane ? { width: value.width, height: value.height, scale: Math.round(value.scale * 100) / 100, viewport: [...value.viewport] } : undefined;
  },
  locale: (value) => (typeof value === 'string' && value.length <= 35 && /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(value) ? value : undefined),
  timezone: (value) => (typeof value === 'string' && value.length <= 64 && /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value) ? value : undefined),
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

const environmentOf = ({ sources, install, client }) => ({ os: process.platform, osVersion: release(), arch: process.arch, node: process.version, install, sources: [...new Set(sources)].sort(), ...clientOf(client) });

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
  // Memoised per run, a miss included; a 401 clears it.
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
      const ids = items.slice(0, MAX_IDS).map((report) => report.id).join(',');
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
  const merged = (report, issue) => (issue ? { ...report, title: issue.title, state: STATE_NAMES[issue.outcome] || issue.outcome, outcome: issue.outcome, changed_at: issue.updatedAt } : report);
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
      const answers = (issue ? issue.answers : []).map((answer) => ({ at: answer.at, by: answer.author || '', text: answer.body })).sort((a, b) => a.at.localeCompare(b.at));
      const shown = merged(report, issue);
      return { ...shown, answers, unanswered: (shown.outcome === 'done' || shown.outcome === 'dropped') && !answers.length };
    },
  };
};

/** Files a report through the relay; returns {identifier, url, title}. */
export const createFeedback = async ({ http, relayUrl, reports, version, sources = [], install = 'source', client = null }, { kind = 'improvement', title, body = '' }) => {
  const cleanTitle = String(title || '').trim().slice(0, 140);
  if (!cleanTitle) {
    throw new ApiError('INVALID_ARGUMENT', { detail: 'a title is required' }, [{ field: 'title', description: 'A report needs a title.' }]);
  }
  const text = String(body || '').trim().slice(0, 6000);
  const issue = await call(http, relayUrl, { method: 'POST', body: { product: PRODUCT, kind, title: cleanTitle, body: text || cleanTitle, version: version || undefined, environment: environmentOf({ sources, install, client }) } });
  if (reports) {
    reports.add({ id: issue.identifier, url: issue.url, title: cleanTitle, kind, body: text, filed_at: nowIso() });
  }
  return { identifier: issue.identifier, url: issue.url, title: cleanTitle };
};
