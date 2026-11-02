/** Linear connector: your issues in one workspace (optionally one team or project) with comments and the moment they entered their state. API key from the secret store. */
import { toIsoUtc } from '../lib/text.mjs';

const API = 'https://api.linear.app/graphql';
const DEFAULT_SERVICE = 'whose-turn-linear';
const TOKEN_TTL = 10 * 60 * 1000;

export const id = 'linear';
export const label = 'Linear';
export const fields = [
  { key: 'workspace', label: 'Workspace slug', hint: 'the part after linear.app/ in your issue links', required: true },
  { key: 'api_key', label: 'API key', hint: 'a personal API key, stored in the secret store, never in the config', secret: { account: 'workspace', service: 'token_service', default: DEFAULT_SERVICE } },
  { key: 'token_service', label: 'Secret entry', hint: 'name of the secret-store entry; default whose-turn-linear' },
  { key: 'team', label: 'Team key', hint: 'only issues of this team, for example RMA; empty for all' },
  { key: 'project', label: 'Project', hint: 'only issues of this project, by name; empty for all' },
];

const QUERY = `
query Mine($filter: IssueFilter!, $after: String) {
  viewer { id name displayName }
  issues(filter: $filter, first: 50, after: $after, orderBy: updatedAt) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title url updatedAt completedAt
      state { name type }
      assignee { id name displayName }
      comments(first: 50) { nodes { id body createdAt url user { id name displayName } } }
      history(first: 25) { nodes { createdAt toState { name } actor { name displayName } } }
    }
  }
}`;

const CATEGORY = { completed: 'done', canceled: 'done', started: 'indeterminate', backlog: 'new', unstarted: 'new', triage: 'new' };

const mentionText = (body) => String(body || '').replace(/\[@?([^\]]+)\]\(https:\/\/linear\.app\/[^)]*\/profiles\/[^)]*\)/g, '@$1');

const stateEntered = (issue) => {
  const entries = (issue.history?.nodes || []).filter((entry) => entry.toState && entry.toState.name === issue.state?.name);
  if (!entries.length) {
    return null;
  }
  const latest = entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  return { since: toIsoUtc(latest.createdAt), by: latest.actor?.displayName || latest.actor?.name || '' };
};

const buildFilter = (settings, done) => {
  const filter = { assignee: { isMe: { eq: true } } };
  if (done) {
    filter.completedAt = { gte: new Date(Date.now() - 30 * 86400000).toISOString() };
  } else {
    filter.state = { type: { nin: ['completed', 'canceled'] } };
  }
  if (settings.team) {
    filter.team = { key: { eq: settings.team } };
  }
  if (settings.project) {
    filter.project = { name: { eqIgnoreCase: settings.project } };
  }
  return filter;
};

const apiKey = async (settings, secrets, cache) => {
  if (!cache.token || Date.now() - cache.tokenAt > TOKEN_TTL) {
    const service = settings.token_service || DEFAULT_SERVICE;
    cache.token = await secrets.get(service, settings.workspace);
    cache.tokenAt = Date.now();
    if (!cache.token) {
      throw new Error(`No Linear API key in the secret store (service ${service}, account ${settings.workspace})`);
    }
  }
  return cache.token;
};

const fetchAll = async (http, key, filter) => {
  const nodes = [];
  let after = null;
  let viewer = null;
  for (let page = 0; page < 10; page += 1) {
    const result = await http.fetchJson(API, { method: 'POST', body: { query: QUERY, variables: { filter, after } }, useEtag: false, headers: { Authorization: key, 'Content-Type': 'application/json' } });
    if (result.errors?.length) {
      throw new Error(result.errors.map((error) => error.message).join('; '));
    }
    viewer = result.data.viewer;
    nodes.push(...result.data.issues.nodes);
    if (!result.data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = result.data.issues.pageInfo.endCursor;
  }
  return { viewer, nodes };
};

export const normalise = (issues, viewer) => {
  const me = viewer.displayName || viewer.name || '';
  const tickets = [];
  const comments = [];
  for (const issue of issues) {
    tickets.push({
      key: issue.identifier, summary: issue.title, status: issue.state?.name || '', status_category: CATEGORY[issue.state?.type] || 'indeterminate',
      assignee: issue.assignee?.displayName || issue.assignee?.name || 'Unassigned', updated: issue.updatedAt, url: issue.url,
      status_change: issue.state?.type === 'completed' ? null : stateEntered(issue),
    });
    for (const comment of issue.comments?.nodes || []) {
      comments.push({ id: comment.id, key: issue.identifier, at: toIsoUtc(comment.createdAt), author: comment.user?.displayName || comment.user?.name || '', body: mentionText(comment.body), url: comment.url || issue.url });
    }
  }
  const base = tickets[0] ? tickets[0].url.replace(/\/issue\/[^/]+.*$/, '/issue/') : '';
  return { me, tickets, comments, ticket_base: base };
};

export const poll = async ({ settings, http, secrets, cache }) => {
  const key = await apiKey(settings, secrets, cache);
  const [open, done] = await Promise.all([fetchAll(http, key, buildFilter(settings, false)), fetchAll(http, key, buildFilter(settings, true))]);
  const seen = new Set();
  const issues = [...open.nodes, ...done.nodes].filter((issue) => !seen.has(issue.id) && seen.add(issue.id));
  const result = normalise(issues, open.viewer || done.viewer || {});
  return { ...result, ticket_base: result.ticket_base || `https://linear.app/${settings.workspace}/issue/`, errors: {} };
};
