/** Files a bug or an improvement about the monitor itself through the maintainer's relay, and reads back what became of it. RMA-104, RMA-280. */
import { join } from 'node:path';
import { readJson, writeJson } from './store.mjs';
import { nowIso } from './text.mjs';
import { ApiError } from './errors.mjs';
import { RateLimited } from './http-client.mjs';

export const RELAY_URL = 'https://6cd7q2274i726zmnyav22ar2lu0fangt.lambda-url.eu-central-1.on.aws/';
const PRODUCT = 'whose-turn';
const MAX_IDS = 50;
const STATE_NAMES = { open: 'Open', done: 'Done', dropped: 'Dropped' };

/** A relay call; a rate limit, a refused report or a failing answer comes out as the matching ApiError, the raw text only in its debug field. */
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

const contextOf = ({ context, from }) => ({
  from: from || 'the window',
  filed_at: nowIso(),
  ...(context ? { about: (typeof context === 'string' ? context : JSON.stringify(context)).slice(0, 5000) } : {}),
});

/** What this machine filed: the last hundred reports in <data>/reports.json. states() reads their state from the relay, detail() one report with its answers; one relay read serves both, cached for a minute. RMA-120, RMA-123. */
export const openReports = (dataDir, { http, relayUrl }) => {
  const file = join(dataDir, 'reports.json');
  let items = readJson(file, []);
  let cached = null;
  const live = async () => {
    if (cached && Date.now() - cached.at < 60000) {
      return cached.value;
    }
    let value = {};
    if (items.length) {
      try {
        const ids = items.slice(0, MAX_IDS).map((report) => report.id).join(',');
        const answer = await http.fetchJson(`${relayUrl}?product=${PRODUCT}&ids=${encodeURIComponent(ids)}`, { useEtag: false });
        value = Object.fromEntries((answer.issues || []).map((issue) => [issue.identifier, issue]));
      } catch {
        value = {};
      }
    }
    cached = { at: Date.now(), value };
    return value;
  };
  const merged = (report, issue) => (issue ? { ...report, title: issue.title, state: STATE_NAMES[issue.outcome] || issue.outcome, outcome: issue.outcome, changed_at: issue.updatedAt } : report);
  return {
    relayUrl,
    list: () => items.slice(),
    add: (report) => { items = [report, ...items].slice(0, 100); cached = null; writeJson(file, items); return report; },
    states: async () => {
      const issues = await live();
      return items.map((report) => merged(report, issues[report.id]));
    },
    detail: async (id) => {
      const report = items.find((item) => item.id === id);
      if (!report) {
        return null;
      }
      const issue = (await live())[id];
      const answers = (issue ? issue.answers : []).map((answer) => ({ at: answer.at, by: answer.author || '', text: answer.body })).sort((a, b) => a.at.localeCompare(b.at));
      const shown = merged(report, issue);
      return { ...shown, answers, unanswered: Boolean(shown.outcome) && shown.outcome !== 'open' && !answers.length };
    },
  };
};

export const createFeedback = async ({ http, relayUrl, reports, version }, { kind = 'improvement', title, body = '', context = null, from = '' }) => {
  const cleanTitle = String(title || '').trim().slice(0, 140);
  if (!cleanTitle) {
    throw new ApiError('INVALID_ARGUMENT', { detail: 'a title is required' }, [{ field: 'title', description: 'A report needs a title.' }]);
  }
  const text = String(body || '').trim().slice(0, 6000);
  const issue = await call(http, relayUrl, { method: 'POST', body: { product: PRODUCT, kind, title: cleanTitle, body: text || cleanTitle, version: version || undefined, context: contextOf({ context, from }) } });
  if (reports) {
    reports.add({ id: issue.identifier, url: issue.url, title: cleanTitle, kind, body: text, filed_at: nowIso() });
  }
  return { identifier: issue.identifier, url: issue.url, title: cleanTitle };
};
