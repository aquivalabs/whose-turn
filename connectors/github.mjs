/** GitHub connector: your PRs in one repository with reviews, comments and checks, plus review requests and mentions across the org. Token from `gh auth token`. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { oneline, nowIso, mapLimit, wordsRegex } from '../lib/text.mjs';

const run = promisify(execFile);
const API = 'https://api.github.com';

export const id = 'github';
export const label = 'GitHub';
export const links = (settings) => (settings.repo ? [{ label: 'GitHub', url: `https://github.com/${settings.repo}` }] : []);
export const fields = [
  { key: 'repo', label: 'Repository', hint: 'owner/name whose PRs are yours', required: true },
  { key: 'org', label: 'Organisation', hint: 'notifications are kept only from this org; defaults to the repository owner' },
  { key: 'me', label: 'Your login', hint: 'left empty, it is asked from the API once' },
  { key: 'account', label: 'gh account', hint: 'which logged-in gh account to use' },
  { key: 'bots', label: 'Bot logins', hint: 'comma-separated; their comments never count as a reply', list: true },
];

const TOKEN_TTL = 10 * 60 * 1000;

const ghToken = async (account, cache) => {
  if (!cache.token || Date.now() - cache.tokenAt > TOKEN_TTL) {
    const args = account ? ['auth', 'token', '--user', account] : ['auth', 'token'];
    const { stdout } = await run('gh', args);
    cache.token = stdout.trim();
    cache.tokenAt = Date.now();
  }
  return cache.token;
};

const createApi = (http, token) => (path) => {
  const url = path.startsWith(API) ? path : `${API}${path}`;
  if (!url.startsWith(`${API}/`)) {
    throw new Error(`Refusing to send the GitHub token to ${url}`);
  }
  return http.fetchJson(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
};

const checksFor = async (api, repo, sha) => {
  const runs = (await api(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`)).check_runs || [];
  const conclusions = runs.map((checkRun) => checkRun.conclusion || checkRun.status);
  let state = 'passing';
  if (conclusions.some((value) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(value))) {
    state = 'failing';
  } else if (conclusions.some((value) => ['queued', 'in_progress', 'pending', 'waiting', null, undefined].includes(value))) {
    state = 'running';
  } else if (!runs.length) {
    state = 'none';
  }
  const failed = runs.filter((checkRun) => ['failure', 'timed_out'].includes(checkRun.conclusion));
  return { state, failed };
};

const reviewDecision = (reviews) => {
  const latest = {};
  for (const review of reviews) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) {
      latest[review.user.login] = review.state;
    }
  }
  const values = new Set(Object.values(latest));
  if (values.has('CHANGES_REQUESTED')) {
    return 'CHANGES_REQUESTED';
  }
  return values.has('APPROVED') ? 'APPROVED' : '';
};

const failedCheckActivity = (checkRun, number, key) => ({ at: checkRun.completed_at || nowIso(), pr: `#${number}`, key, kind: 'check failed', who: checkRun.name, url: checkRun.html_url, text: '', body: '' });

const buildPr = async (api, { repo, me, bots, keyOf, sinceIso }, number) => {
  const [pr, issueComments, inlineComments, reviews] = await Promise.all([
    api(`/repos/${repo}/pulls/${number}`),
    api(`/repos/${repo}/issues/${number}/comments?per_page=100`),
    api(`/repos/${repo}/pulls/${number}/comments?per_page=100`),
    api(`/repos/${repo}/pulls/${number}/reviews?per_page=100`),
  ]);
  const state = pr.merged_at ? 'MERGED' : pr.state.toUpperCase();
  const checks = await checksFor(api, repo, pr.head.sha);
  const human = [];
  for (const comment of issueComments) {
    human.push({ who: comment.user.login, at: comment.created_at, url: comment.html_url, kind: 'comment', body: comment.body || '', state: '' });
  }
  for (const comment of inlineComments) {
    human.push({ who: comment.user.login, at: comment.created_at, url: comment.html_url, kind: 'inline comment', body: comment.body || '', state: '' });
  }
  for (const review of reviews) {
    if (review.state === 'COMMENTED' && !review.body) {
      continue;
    }
    human.push({ who: review.user.login, at: review.submitted_at || '', url: review.html_url, kind: review.state.toLowerCase().replace(/_/g, ' '), body: review.body || '', state: review.state });
  }
  const people = human.filter((item) => !bots.test(item.who) && item.at).sort((a, b) => a.at.localeCompare(b.at));
  const others = people.filter((item) => item.who !== me);
  const mine = people.filter((item) => item.who === me);
  const last = others[others.length - 1];
  const myLast = mine.length ? mine[mine.length - 1].at : '';
  const key = keyOf(pr.title);
  const row = {
    pr: number, key, title: pr.title, base: pr.base.ref, state, review: reviewDecision(reviews), checks: checks.state, merged_at: pr.merged_at || '',
    updated_at: pr.updated_at, url: pr.html_url,
    last_comment_by: last ? last.who : '', last_comment_at: last ? last.at : '', last_comment_url: last ? last.url : '', last_comment: last ? oneline(last.body, 160) : '',
    unanswered: Boolean(last && state === 'OPEN' && last.state !== 'APPROVED' && last.at > myLast),
  };
  const activity = people.filter((item) => item.at >= sinceIso).map((item) => ({
    at: item.at, pr: `#${number}`, key, kind: item.kind, who: item.who === me ? 'you' : item.who, url: item.url, text: oneline(item.body), body: item.body.replace(/\r/g, '').slice(0, 6000),
  }));
  for (const checkRun of checks.failed) {
    if ((checkRun.completed_at || '') >= sinceIso) {
      activity.push(failedCheckActivity(checkRun, number, key));
    }
  }
  if (pr.merged_at && pr.merged_at >= sinceIso) {
    activity.push({ at: pr.merged_at, pr: `#${number}`, key, kind: 'merged', who: '', url: pr.html_url, text: '', body: '' });
  }
  return { row, activity, sha: pr.head.sha };
};

const refreshChecks = async (api, repo, cached, number) => {
  const checks = await checksFor(api, repo, cached.sha);
  if (checks.state === cached.row.checks) {
    return;
  }
  cached.row.checks = checks.state;
  for (const checkRun of checks.failed) {
    const item = failedCheckActivity(checkRun, number, cached.row.key);
    if (!cached.activity.some((existing) => existing.url === item.url && existing.at === item.at)) {
      cached.activity.push(item);
    }
  }
};

const pollPrs = async (api, context) => {
  const { repo, me, sinceIso, cache } = context;
  const since = sinceIso.slice(0, 10);
  const found = new Map();
  const queries = [`repo:${repo} is:pr author:${me} is:open`, `repo:${repo} is:pr author:${me} updated:>=${since}`];
  const searches = await Promise.all(queries.map((query) => api(`/search/issues?q=${encodeURIComponent(query)}&per_page=50`)));
  for (const item of searches.flatMap((result) => result.items || [])) {
    found.set(item.number, item.updated_at);
  }
  cache.prs = cache.prs || new Map();
  const unchanged = [...found].filter(([number, updatedAt]) => cache.prs.get(number)?.updated_at === updatedAt).map(([number]) => number);
  const changed = [...found].filter(([number]) => !unchanged.includes(number));
  await mapLimit(unchanged.filter((number) => cache.prs.get(number).row.state === 'OPEN'), 4, (number) => refreshChecks(api, repo, cache.prs.get(number), number));
  await mapLimit(changed, 4, async ([number, updatedAt]) => {
    cache.prs.set(number, { updated_at: updatedAt, ...(await buildPr(api, context, number)) });
  });
  for (const number of [...cache.prs.keys()]) {
    if (!found.has(number)) {
      cache.prs.delete(number);
    }
  }
  const prs = [...cache.prs.values()].map((entry) => entry.row).sort((a, b) => a.pr - b.pr);
  const activity = [...cache.prs.values()].flatMap((entry) => entry.activity).filter((item) => item.at >= sinceIso).sort((a, b) => b.at.localeCompare(a.at));
  return { prs, activity };
};

const issueNumber = (apiUrl) => {
  const match = /\/(pulls|issues)\/(\d+)$/.exec(apiUrl || '');
  return match ? Number(match[2]) : null;
};

const buildAsk = async (api, { repo: ownRepo, me, keyOf }, note, repo) => {
  const subject = note.subject;
  const number = issueNumber(subject.url);
  if (!number) {
    return null;
  }
  const title = subject.title || '';
  const ref = repo === ownRepo ? `#${number}` : `${repo.split('/')[1]}#${number}`;
  const base = { repo, number, ref, title, key: keyOf(title), url: `https://github.com/${repo}/${subject.type === 'PullRequest' ? 'pull' : 'issues'}/${number}` };
  if (note.reason === 'review_requested' && subject.type === 'PullRequest') {
    const pr = await api(`/repos/${repo}/pulls/${number}`);
    if (pr.state !== 'open') {
      return null;
    }
    const requested = await api(`/repos/${repo}/pulls/${number}/requested_reviewers`);
    if (!(requested.users || []).some((user) => user.login === me)) {
      return null;
    }
    return { ...base, id: `gha:${note.id}`, kind: 'review requested', who: pr.user.login, at: note.updated_at, text: oneline(title), body: (pr.body || '').slice(0, 6000) };
  }
  let comment = subject.latest_comment_url ? await api(subject.latest_comment_url) : null;
  const comments = await api(`/repos/${repo}/issues/${number}/comments?per_page=100`);
  if (!comment || !(comment.body || '').includes(`@${me}`)) {
    const hits = comments.filter((candidate) => (candidate.body || '').includes(`@${me}`));
    comment = hits.length ? hits[hits.length - 1] : comment;
  }
  if (!comment) {
    return null;
  }
  const at = comment.created_at || note.updated_at;
  if (comments.some((candidate) => candidate.user.login === me && candidate.created_at > at)) {
    return null;
  }
  return { ...base, id: `gha:${note.id}`, kind: 'mentioned you', who: comment.user.login, at, url: comment.html_url || base.url, text: oneline(comment.body || ''), body: (comment.body || '').replace(/\r/g, '').slice(0, 6000) };
};

const pollAsks = async (api, context) => {
  const { org, cache } = context;
  const notes = await api('/notifications?participating=true&all=false&per_page=50');
  cache.asks = cache.asks || new Map();
  const rows = [];
  const seen = new Set();
  const relevant = notes.filter((note) => note.repository.full_name.startsWith(`${org}/`) && ['review_requested', 'mention', 'team_mention', 'assign'].includes(note.reason));
  await mapLimit(relevant, 4, async (note) => {
    seen.add(note.id);
    const cached = cache.asks.get(note.id);
    const row = cached && cached.updated_at === note.updated_at ? cached.row : await buildAsk(api, context, note, note.repository.full_name);
    cache.asks.set(note.id, { updated_at: note.updated_at, row });
    if (row) {
      rows.push(row);
    }
  });
  for (const noteId of [...cache.asks.keys()]) {
    if (!seen.has(noteId)) {
      cache.asks.delete(noteId);
    }
  }
  return rows;
};

export const poll = async ({ settings, http, cache, sinceIso, keyOf }) => {
  const api = createApi(http, await ghToken(settings.account, cache));
  const me = settings.me || (cache.me ??= (await api('/user')).login);
  const context = { repo: settings.repo, org: settings.org || settings.repo.split('/')[0], me, bots: wordsRegex(settings.bots || ['github-actions', 'dependabot', '[bot]']), keyOf, sinceIso, cache };
  const [prsOutcome, asksOutcome] = await Promise.allSettled([pollPrs(api, context), pollAsks(api, context)]);
  const errors = {};
  for (const [part, outcome] of [['pulls', prsOutcome], ['notifications', asksOutcome]]) {
    if (outcome.status === 'rejected') {
      if (outcome.reason.name === 'RateLimited') {
        throw outcome.reason;
      }
      errors[part] = `${outcome.reason.name}: ${outcome.reason.message}`;
    }
  }
  const last = cache.last || { prs: [], activity: [], asks: [] };
  cache.last = {
    prs: prsOutcome.status === 'fulfilled' ? prsOutcome.value.prs : last.prs,
    activity: prsOutcome.status === 'fulfilled' ? prsOutcome.value.activity : last.activity,
    asks: asksOutcome.status === 'fulfilled' ? asksOutcome.value : last.asks,
  };
  return { me, ...cache.last, errors };
};
