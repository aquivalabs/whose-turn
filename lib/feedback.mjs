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
  issues(filter: { team: { key: { eq: $team } }, number: { in: $numbers } }) { nodes { identifier title url updatedAt state { name type } } }
}`;

const CREATE = `
mutation Create($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url title } }
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

const keyFor = async (settings, secrets) => (settings && settings.workspace ? secrets.get(settings.token_service || DEFAULT_SERVICE, settings.workspace) : '');

/** What this machine filed: <data>/reports.json keeps the last hundred issues so the reporter can follow them without a Linear account. RMA-120. */
export const openReports = (dataDir) => {
  const file = join(dataDir, 'reports.json');
  let items = readJson(file, []);
  return {
    list: () => items.slice(),
    add: (report) => { items = [report, ...items].slice(0, 100); writeJson(file, items); return report; },
  };
};

/** The stored reports with their current Linear state, read with the feedback key and cached for a minute; without a key or on an error the stored entries come back as they are. */
export const reportStates = async ({ settings, secrets, http, cache }, reports) => {
  if (!reports.length) {
    return [];
  }
  if (cache.states && Date.now() - cache.states.at < 60000) {
    return cache.states.value;
  }
  let live = {};
  const key = await keyFor(settings, secrets);
  if (key && settings.team) {
    try {
      const numbers = reports.map((report) => Number(String(report.id).split('-')[1])).filter(Number.isFinite);
      const data = await call(http, key, STATES, { team: settings.team, numbers });
      live = Object.fromEntries(data.issues.nodes.map((node) => [node.identifier, node]));
    } catch {
      /* Linear unreachable or the key gone: the list still says what was filed */
    }
  }
  const value = reports.map((report) => {
    const issue = live[report.id];
    return { ...report, title: issue ? issue.title : report.title, state: issue ? issue.state.name : '', state_type: issue ? issue.state.type : '', changed_at: issue ? issue.updatedAt : '' };
  });
  cache.states = { at: Date.now(), value };
  return value;
};

export const createFeedback = async ({ settings, secrets, http, cache }, { kind = 'improvement', title, body = '', context = null, from = '' }) => {
  const cleanTitle = String(title || '').trim().slice(0, 200);
  if (!cleanTitle) {
    throw new Error('A title is required');
  }
  if (!settings || !settings.workspace || !settings.team || !settings.project) {
    throw new Error('feedback is not configured: set feedback.workspace, feedback.team and feedback.project in the config');
  }
  const key = await keyFor(settings, secrets);
  if (!key) {
    throw new Error(`No Linear key for feedback in the secret store (service ${settings.token_service || DEFAULT_SERVICE}, account ${settings.workspace})`);
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
  return data.issueCreate.issue;
};
