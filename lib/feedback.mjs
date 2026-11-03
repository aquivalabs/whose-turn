/** Files a bug or an improvement about the monitor itself into its own Linear project, with the context the sender attaches. RMA-104. */
import { join } from 'node:path';
import { readJson, writeJson } from './store.mjs';
import { nowIso } from './text.mjs';

const API = 'https://api.linear.app/graphql';
export const DEFAULT_SERVICE = 'whose-turn-feedback';
const KINDS = { bug: 'Bug', improvement: 'Improvement', idea: 'Feature' };

const LOOKUP = `
query Lookup($team: String!, $project: String!) {
  teams(filter: { key: { eq: $team } }) { nodes { id key labels { nodes { id name } } } }
  projects(filter: { name: { eqIgnoreCase: $project } }) { nodes { id name } }
  workflowStates: issueLabels(first: 1) { nodes { id } }
}`;

const STATES = `
query States($team: String!, $numbers: [Float!]!) {
  issues(first: 100, filter: { team: { key: { eq: $team } }, number: { in: $numbers } }) { nodes { identifier title url updatedAt state { name type } } }
}`;

const ANSWERS = `
query Answers($id: String!) {
  issue(id: $id) { comments(first: 50) { nodes { body createdAt user { name } } } }
}`;

const CREATE = `
mutation Create($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier number url title } }
}`;

const call = async (http, key, query, variables) => {
  const result = await http.fetchJson(API, { method: 'POST', body: { query, variables }, useEtag: false, headers: { Authorization: key, 'Content-Type': 'application/json' } });
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join('; '));
  }
  return result.data;
};

const describe = ({ kind, body, context, from }) => [
  body ? body.trim() : '',
  '',
  '---',
  `Filed from Whose Turn by ${from || 'the window'} on ${nowIso()} as ${KINDS[kind] || kind}.`,
  ...(context ? ['', typeof context === 'string' ? context.slice(0, 6000) : `\`\`\`json\n${JSON.stringify(context, null, 1).slice(0, 6000)}\n\`\`\``] : []),
].join('\n');

const serviceOf = (settings) => settings.token_service || DEFAULT_SERVICE;
const keyFor = async (settings, secrets) => (settings && settings.workspace ? secrets.get(serviceOf(settings), settings.workspace) : '');

/** Which way an issue went: open, done, or dropped (canceled); the window and the report page see no Linear vocabulary. */
const outcomeOf = (state) => ({ completed: 'done', canceled: 'dropped' }[state.type] || 'open');

const askLinear = async ({ settings, secrets, http }, query, variables) => {
  const key = await keyFor(settings, secrets);
  if (!key || !settings.team) {
    return null;
  }
  try {
    return await call(http, key, query, variables);
  } catch {
    return null;
  }
};

/** What this machine filed: <data>/reports.json keeps the last hundred issues so the reporter can follow them without a Linear account. states() reads their current Linear state, detail() one issue's comments as the maintainer's answers; both through the feedback key, cached for a minute. RMA-120, RMA-123. */
export const openReports = (dataDir) => {
  const file = join(dataDir, 'reports.json');
  let items = readJson(file, []);
  const cache = new Map();
  const remembered = async (name, read) => {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < 60000) {
      return hit.value;
    }
    const value = await read();
    cache.set(name, { at: Date.now(), value });
    return value;
  };
  const states = (deps) => remembered('states', async () => {
    const data = items.length ? await askLinear(deps, STATES, { team: deps.settings.team, numbers: items.map((report) => report.number).filter(Number.isFinite) }) : null;
    const live = Object.fromEntries((data ? data.issues.nodes : []).map((node) => [node.identifier, node]));
    return items.map((report) => {
      const issue = live[report.id];
      return issue ? { ...report, title: issue.title, state: issue.state.name, outcome: outcomeOf(issue.state), changed_at: issue.updatedAt } : report;
    });
  });
  return {
    list: () => items.slice(),
    add: (report) => { items = [report, ...items].slice(0, 100); cache.clear(); writeJson(file, items); return report; },
    states,
    detail: async (deps, id) => {
      const report = (await states(deps)).find((item) => item.id === id);
      if (!report) {
        return null;
      }
      const answers = await remembered(`answers:${id}`, async () => {
        const data = await askLinear(deps, ANSWERS, { id });
        return (data && data.issue ? data.issue.comments.nodes : []).map((comment) => ({ at: comment.createdAt, by: comment.user ? comment.user.name : '', text: comment.body })).sort((a, b) => a.at.localeCompare(b.at));
      });
      return { ...report, answers, unanswered: Boolean(report.outcome) && report.outcome !== 'open' && !answers.length };
    },
  };
};

export const NOT_CONFIGURED = 'feedback is not configured: set feedback.workspace, feedback.team and feedback.project in the config';

/** True when the config names the Linear workspace, team and project reports go to. */
export const isConfigured = (settings) => Boolean(settings && settings.workspace && settings.team && settings.project);

export const createFeedback = async ({ settings, secrets, http, cache, reports }, { kind = 'improvement', title, body = '', context = null, from = '' }) => {
  const cleanTitle = String(title || '').trim().slice(0, 200);
  if (!cleanTitle) {
    throw new Error('A title is required');
  }
  if (!isConfigured(settings)) {
    throw new Error(NOT_CONFIGURED);
  }
  const key = await keyFor(settings, secrets);
  if (!key) {
    throw new Error(`No Linear key for feedback in the secret store (service ${serviceOf(settings)}, account ${settings.workspace})`);
  }
  if (!cache.lookup) {
    const data = await call(http, key, LOOKUP, { team: settings.team, project: settings.project });
    const team = data.teams.nodes[0];
    const project = data.projects.nodes[0];
    if (!team || !project) {
      throw new Error(`Linear team ${settings.team} or project ${settings.project} not found`);
    }
    cache.lookup = { teamId: team.id, projectId: project.id, labels: Object.fromEntries(team.labels.nodes.map((label) => [label.name.toLowerCase(), label.id])) };
  }
  const labelId = cache.lookup.labels[(KINDS[kind] || kind).toLowerCase()];
  const input = { teamId: cache.lookup.teamId, projectId: cache.lookup.projectId, title: cleanTitle, description: describe({ kind, body, context, from }), ...(labelId ? { labelIds: [labelId] } : {}) };
  const data = await call(http, key, CREATE, { input });
  if (!data.issueCreate?.success) {
    throw new Error('Linear did not create the issue');
  }
  const issue = data.issueCreate.issue;
  if (reports) {
    reports.add({ id: issue.identifier, number: issue.number, url: issue.url, title: issue.title, kind, body: String(body || '').trim(), filed_at: nowIso() });
  }
  return issue;
};
