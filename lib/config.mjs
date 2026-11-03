/** Loads the workspace config: data directory, defaults, and the list of workspaces, each with its connector entries and rules. */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { isHex } from './palette.mjs';
import { statusGroups } from './facts.mjs';
import { tableProblems } from './table.mjs';
import { DEFAULT_LIMITS } from './health.mjs';

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

/** The per-platform directory that holds config.json and the state, unless WHOSE_TURN_DATA overrides it. */
export const defaultDataDir = () => {
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

/** The monitor's port: WHOSE_TURN_PORT, then `port` in the config file, then 8765. */
export const resolvePort = (dataDir, env = process.env) => {
  if (env.WHOSE_TURN_PORT) {
    return Number(env.WHOSE_TURN_PORT);
  }
  const raw = readJson(env.WHOSE_TURN_CONFIG || join(dataDir, 'config.json'));
  return Number(raw?.port || 8765);
};

const mergeRules = (rules = {}) => ({
  ...DEFAULT_RULES,
  ...rules,
  statuses: { ...DEFAULT_RULES.statuses, ...(rules.statuses || {}) },
});

const normaliseRules = (rules, problems, workspaceId) => {
  const merged = /** @type {any} */ (mergeRules(rules));
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

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const connectorEntries = (connectors) => {
  const list = Array.isArray(connectors) ? connectors : Object.entries(connectors || {}).map(([type, settings]) => ({ type, ...settings }));
  return list.filter(isObject).map((entry) => ({ ...entry, id: String(entry.id || entry.type) }));
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

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

const fieldProblems = (workspace, id) => {
  const problems = [];
  const where = `Workspace "${id}"`;
  if (workspace.key_pattern) {
    try {
      new RegExp(workspace.key_pattern);
    } catch (error) {
      problems.push(`${where}: key_pattern is not a valid regular expression: ${error.message}`);
    }
  }
  const rules = workspace.rules || {};
  const statuses = rules.statuses;
  if (statuses !== undefined && (!statuses || typeof statuses !== 'object' || Array.isArray(statuses))) {
    problems.push(`${where}: rules.statuses must be an object of lists.`);
  } else {
    for (const [group, list] of Object.entries(statuses || {})) {
      if (!isStringList(list) || list.some((item) => !item.trim())) {
        problems.push(`${where}: rules.statuses.${group} must be a list of non-empty strings.`);
      }
    }
  }
  for (const key of ['automation_authors', 'question_words']) {
    if (rules[key] !== undefined && !isStringList(rules[key])) {
      problems.push(`${where}: rules.${key} must be a list of strings.`);
    }
  }
  return problems;
};

const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const normaliseWorkspace = (workspace, index, problems) => {
  const missing = workspace.id === undefined || workspace.id === null;
  const id = String(missing ? `ws${index + 1}` : workspace.id);
  if (!missing && !(typeof workspace.id === 'string' && WORKSPACE_ID.test(id))) {
    problems.push(`Workspace ${index + 1}: the id "${id}" must be 1 to 40 lowercase letters, digits or hyphens, starting with a letter or digit.`);
  }
  problems.push(...fieldProblems(workspace, id));
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
    problems.push(`No workspace config yet: open Settings (the gear) to add a source, or try the demo workspace. It will be written to ${configFile}.`);
  } else if (raw.parse_error) {
    problems.push(`Cannot parse ${configFile}: ${raw.parse_error}`);
  }
  const source = raw && !raw.parse_error ? raw : {};
  const rawWorkspaces = Array.isArray(source.workspaces) ? source.workspaces : [legacyWorkspace(source)];
  const { workspaces: normalised, problems: shapeProblems } = normaliseWorkspaces(rawWorkspaces);
  const workspaces = normalised.filter((workspace) => WORKSPACE_ID.test(workspace.id));
  return {
    dataDir,
    configFile,
    port: resolvePort(dataDir, env),
    pollSeconds: Number(source.poll_seconds || 60),
    historyDays: Number(source.history_days || 14),
    health: normaliseHealth(source, problems),
    feedback: source.feedback && typeof source.feedback === 'object' ? source.feedback : null,
    workspaces,
    rawWorkspaces,
    problems: [...problems, ...shapeProblems],
  };
};

const normaliseHealth = (source, problems) => Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, fallback]) => {
  const value = source[key] === undefined ? fallback : Number(source[key]);
  if (!(value > 0)) {
    problems.push(`${key} must be a positive number; using ${fallback}.`);
    return [key, fallback];
  }
  return [key, value];
}));

/** Field violations for entries that are not objects: a workspace, or a connector in a workspace's connectors list. Checked before normalising, which assumes objects. */
export const entryShapeViolations = (rawWorkspaces) => (Array.isArray(rawWorkspaces) ? rawWorkspaces : []).flatMap((workspace, index) => {
  if (!isObject(workspace)) {
    return [{ field: `workspaces[${index}]`, description: 'Every workspace must be an object.' }];
  }
  return (Array.isArray(workspace.connectors) ? workspace.connectors : []).flatMap((entry, at) => (isObject(entry)
    ? []
    : [{ field: `workspaces[${index}].connectors[${at}]`, description: 'Every connector must be an object.' }]));
});

/** Normalises a raw workspace list and reports what is wrong with it, without touching disk. */
export const normaliseWorkspaces = (rawWorkspaces) => {
  const problems = [];
  const list = Array.isArray(rawWorkspaces) ? rawWorkspaces : [];
  const workspaces = list.map((workspace, index) => normaliseWorkspace(isObject(workspace) ? workspace : {}, index, problems));
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

/** Writes the workspace list into the config file, keeping its other top-level keys and dropping the flat pre-workspace keys; the previous file is kept as config.json.bak. */
export const saveWorkspaces = (configFile, rawWorkspaces) => {
  const current = readJson(configFile);
  const source = current && !current.parse_error ? current : {};
  delete source.github;
  delete source.jira;
  delete source.rules;
  const next = { ...source, workspaces: rawWorkspaces };
  mkdirSync(dirname(configFile), { recursive: true });
  if (existsSync(configFile)) {
    writeFileSync(`${configFile}.bak.tmp`, readFileSync(configFile));
    renameSync(`${configFile}.bak.tmp`, `${configFile}.bak`);
  }
  writeFileSync(`${configFile}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${configFile}.tmp`, configFile);
};
