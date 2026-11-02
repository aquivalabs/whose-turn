/** Files a bug or an improvement about the monitor itself into its own Linear project, with the context the sender attaches. RMA-104. */
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

export const createFeedback = async ({ settings, secrets, http, cache }, { kind = 'improvement', title, body = '', context = null, from = '' }) => {
  const cleanTitle = String(title || '').trim().slice(0, 200);
  if (!cleanTitle) {
    throw new Error('A title is required');
  }
  if (!settings || !settings.workspace || !settings.team || !settings.project) {
    throw new Error('feedback is not configured: set feedback.workspace, feedback.team and feedback.project in the config');
  }
  const service = settings.token_service || DEFAULT_SERVICE;
  const key = await secrets.get(service, settings.workspace);
  if (!key) {
    throw new Error(`No Linear key for feedback in the secret store (service ${service}, account ${settings.workspace})`);
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
