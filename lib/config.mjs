/** Loads the workspace config: data directory, defaults, and the list of workspaces, each with its connector entries and rules. */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { isHex } from './palette.mjs';
import { statusGroups } from './facts.mjs';
import { tableProblems } from './table.mjs';

export const DEFAULT_RULES = {
  release_branch_prefix: 'release/',
  approved_next: 'Merge it',
  approved_release_next: 'Hand over to QA',
  passed_next: 'Merge it and close the ticket',
  merged_next: 'Close the ticket',
  statuses: {
    passed: ['passed'],
    code_review: ['code review', 'in review'],
    qa: ['ready for qa', 'in qa', 'testing'],
    on_hold: ['on hold', 'blocked'],
    backlog: ['backlog'],
  },
  automation_authors: ['automation'],
  backlog_rows: 'hide',
  question_words: ['please', 'pls', 'can you', 'could you', 'would you', 'let me know', 'need you', 'need your', 'thoughts', 'recommend', 'advise', 'confirm', 'clarify'],
};

export const DEFAULT_KEY_PATTERN = '\\b[A-Z][A-Z0-9_]+-\\d+\\b';

/** What a settings form or Claude may edit on a workspace, beyond its connectors: one entry per field, neutral wording. */
export const WORKSPACE_FIELDS = {
  workspace: [
    { key: 'id', label: 'Id', hint: 'short, used in the API and on disk', required: true },
    { key: 'name', label: 'Name' },
    { key: 'key_pattern', label: 'Ticket key pattern', hint: 'regex for keys in PR titles and to-dos; empty matches any Jira-style key' },
    { key: 'links', label: 'Quick links', hint: 'one per entry as "Label https://…", comma-separated; the repository, Jira site and Linear project come by themselves', list: true },
  ],
  theme: [
    { key: 'seed', label: 'Seed colour', hint: 'the scheme is derived from it; none keeps the default', colour: true },
    { key: 'accent', label: 'Accent colour', hint: 'optional second hue', colour: true },
  ],
  rules: [
    { key: 'approved_next', label: 'Approved PR', hint: 'next step when a PR under review is approved' },
    { key: 'approved_release_next', label: 'Approved release PR', hint: 'same, for a PR into a branch with the release prefix' },
    { key: 'release_branch_prefix', label: 'Release branch prefix' },
    { key: 'passed_next', label: 'Ticket passed', hint: 'next step when the ticket reached a passed status' },
    { key: 'merged_next', label: 'PR merged', hint: 'next step when the PR is merged and the ticket is still on you' },
    { key: 'automation_authors', label: 'Automation authors', hint: 'comment authors to ignore', list: true },
    { key: 'backlog_rows', label: 'Backlog tickets', hint: 'hide, or list: show them under Waiting on others as a plain task list, for a project you run alone' },
  ],
  statuses: [
    { key: 'code_review', label: 'Review statuses', list: true },
    { key: 'qa', label: 'Verification statuses', list: true },
    { key: 'passed', label: 'Passed statuses', list: true },
    { key: 'on_hold', label: 'On hold statuses', list: true },
    { key: 'backlog', label: 'Backlog statuses', list: true },
  ],
};

const defaultDataDir = () => {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'whose-turn');
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'whose-turn');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'whose-turn');
};

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return error.code === 'ENOENT' ? null : { parse_error: error.message };
  }
};

const mergeRules = (rules = {}) => ({
  ...DEFAULT_RULES,
  ...rules,
  statuses: { ...DEFAULT_RULES.statuses, ...(rules.statuses || {}) },
});

const normaliseRules = (rules, problems, workspaceId) => {
  const merged = mergeRules(rules);
  const issues = tableProblems(merged.table, statusGroups(merged.statuses));
  if (issues.length) {
    problems.push(...issues.map((issue) => `Workspace "${workspaceId}": ${issue}; the table is ignored.`));
    delete merged.table;
  }
  return merged;
};

const legacyWorkspace = (raw) => {
  const connectors = [];
  if (raw.github?.repo) {
    connectors.push({ type: 'github', ...raw.github });
  }
  if (raw.jira?.base) {
    connectors.push({ type: 'jira', ...raw.jira });
  }
  return { id: 'default', name: 'Default', connectors, rules: raw.rules, key_pattern: raw.jira?.key_pattern };
};

const connectorEntries = (connectors) => {
  const list = Array.isArray(connectors) ? connectors : Object.entries(connectors || {}).map(([type, settings]) => ({ type, ...settings }));
  return list.map((entry) => ({ ...entry, id: String(entry.id || entry.type) }));
};

const normaliseTheme = (theme, problems, workspaceId) => {
  if (!theme) {
    return null;
  }
  if (!isHex(theme.seed)) {
    problems.push(`Workspace "${workspaceId}": theme.seed must be a hex colour like #3d7a5c; the theme is ignored.`);
    return null;
  }
  if (theme.accent !== undefined && !isHex(theme.accent)) {
    problems.push(`Workspace "${workspaceId}": theme.accent must be a hex colour like #c27a2c; the accent is ignored.`);
  }
  return { seed: theme.seed.toLowerCase(), ...(isHex(theme.accent) ? { accent: theme.accent.toLowerCase() } : {}) };
};

const normaliseLinks = (links) => (Array.isArray(links) ? links : []).map((entry) => {
  if (typeof entry === 'string') {
    const match = /^(.*?)\s*(https?:\/\/\S+)$/.exec(entry.trim());
    return match ? { label: match[1].trim() || match[2].replace(/^https?:\/\//, ''), url: match[2] } : null;
  }
  return entry && /^https?:\/\//.test(String(entry.url || '')) ? { label: String(entry.label || entry.url), url: String(entry.url) } : null;
}).filter(Boolean);

const normaliseWorkspace = (workspace, index, problems) => {
  const id = String(workspace.id || `ws${index + 1}`);
  return {
    id,
    links: normaliseLinks(workspace.links),
    name: String(workspace.name || workspace.id || `Workspace ${index + 1}`),
    connectors: connectorEntries(workspace.connectors),
    rules: normaliseRules(workspace.rules, problems, id),
    key_pattern: workspace.key_pattern || DEFAULT_KEY_PATTERN,
    theme: normaliseTheme(workspace.theme, problems, id),
  };
};

export const loadConfig = (env = process.env) => {
  const dataDir = env.WHOSE_TURN_DATA || defaultDataDir();
  const configFile = env.WHOSE_TURN_CONFIG || join(dataDir, 'config.json');
  const raw = readJson(configFile);
  const problems = [];
  if (raw === null) {
    problems.push(`No workspace config at ${configFile}. Copy config.example.json there and fill it in.`);
  } else if (raw.parse_error) {
    problems.push(`Cannot parse ${configFile}: ${raw.parse_error}`);
  }
  const source = raw && !raw.parse_error ? raw : {};
  const rawWorkspaces = Array.isArray(source.workspaces) ? source.workspaces : [legacyWorkspace(source)];
  const { workspaces, problems: shapeProblems } = normaliseWorkspaces(rawWorkspaces);
  return {
    dataDir,
    configFile,
    port: Number(env.WHOSE_TURN_PORT || source.port || 8765),
    pollSeconds: Number(source.poll_seconds || 60),
    historyDays: Number(source.history_days || 14),
    feedback: source.feedback && typeof source.feedback === 'object' ? source.feedback : null,
    workspaces,
    rawWorkspaces,
    problems: [...problems, ...shapeProblems],
  };
};

/** Normalises a raw workspace list and reports what is wrong with it, without touching disk. */
export const normaliseWorkspaces = (rawWorkspaces) => {
  const problems = [];
  const list = Array.isArray(rawWorkspaces) ? rawWorkspaces : [];
  const workspaces = list.map((workspace, index) => normaliseWorkspace(workspace, index, problems));
  const seen = new Set();
  for (const workspace of workspaces) {
    if (seen.has(workspace.id)) {
      problems.push(`Two workspaces share the id "${workspace.id}".`);
    }
    seen.add(workspace.id);
    const connectorIds = workspace.connectors.map((entry) => entry.id);
    if (new Set(connectorIds).size !== connectorIds.length) {
      problems.push(`Workspace "${workspace.id}" has two connectors with the same id; give each an "id".`);
    }
  }
  return { workspaces, problems };
};

/** Writes the workspace list into the config file, keeping its other top-level keys and dropping the flat pre-workspace keys. */
export const saveWorkspaces = (configFile, rawWorkspaces) => {
  const current = readJson(configFile);
  const source = current && !current.parse_error ? current : {};
  delete source.github;
  delete source.jira;
  delete source.rules;
  const next = { ...source, workspaces: rawWorkspaces };
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(`${configFile}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${configFile}.tmp`, configFile);
};
