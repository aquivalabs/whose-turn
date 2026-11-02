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

/** The current Linear state of the given issue numbers, by identifier; empty when there is no key or Linear does not answer. */
const liveStates = async ({ settings, secrets, http }, numbers) => {
  const key = await keyFor(settings, secrets);
  if (!key || !settings.team || !numbers.length) {
    return {};
  }
  try {
    const data = await call(http, key, STATES, { team: settings.team, numbers });
    return Object.fromEntries(data.issues.nodes.map((node) => [node.identifier, node]));
  } catch {
    return {};
  }
};

/** What this machine filed: <data>/reports.json keeps the last hundred issues so the reporter can follow them without a Linear account; states() reads their current Linear state with the feedback key, cached for a minute. RMA-120. */
export const openReports = (dataDir) => {
  const file = join(dataDir, 'reports.json');
  let items = readJson(file, []);
  let cached = null;
  return {
    list: () => items.slice(),
    add: (report) => { items = [report, ...items].slice(0, 100); cached = null; writeJson(file, items); return report; },
    states: async (deps) => {
      if (!items.length) {
        return [];
      }
      if (cached && Date.now() - cached.at < 60000) {
        return cached.value;
      }
      const live = await liveStates(deps, items.map((report) => report.number).filter(Number.isFinite));
      const value = items.map((report) => {
        const issue = live[report.id];
        return issue ? { ...report, title: issue.title, state: issue.state.name, done: issue.state.type === 'completed' || issue.state.type === 'canceled', changed_at: issue.updatedAt } : report;
      });
      cached = { at: Date.now(), value };
      return value;
    },
  };
};

export const createFeedback = async ({ settings, secrets, http, cache, reports }, { kind = 'improvement', title, body = '', context = null, from = '' }) => {
  const cleanTitle = String(title || '').trim().slice(0, 200);
  if (!cleanTitle) {
    throw new Error('A title is required');
  }
  if (!settings || !settings.workspace || !settings.team || !settings.project) {
    throw new Error('feedback is not configured: set feedback.workspace, feedback.team and feedback.project in the config');
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
    reports.add({ id: issue.identifier, number: issue.number, url: issue.url, title: issue.title, kind, filed_at: nowIso() });
  }
  return issue;
};
