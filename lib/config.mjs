/** Loads the workspace config: data directory, defaults, and the list of workspaces, each with its connector entries and rules. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { isHex } from './palette.mjs';

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
  question_words: ['please', 'pls', 'can you', 'could you', 'would you', 'let me know', 'need you', 'need your', 'thoughts', 'recommend', 'advise', 'confirm', 'clarify'],
};

export const DEFAULT_KEY_PATTERN = '\\b[A-Z][A-Z0-9_]+-\\d+\\b';

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

const normaliseWorkspace = (workspace, index, problems) => ({
  id: String(workspace.id || `ws${index + 1}`),
  name: String(workspace.name || workspace.id || `Workspace ${index + 1}`),
  connectors: connectorEntries(workspace.connectors),
  rules: mergeRules(workspace.rules),
  key_pattern: workspace.key_pattern || DEFAULT_KEY_PATTERN,
  theme: normaliseTheme(workspace.theme, problems, String(workspace.id || `ws${index + 1}`)),
});

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
  const workspaces = rawWorkspaces.map((workspace, index) => normaliseWorkspace(workspace, index, problems));
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
  return {
    dataDir,
    port: Number(env.WHOSE_TURN_PORT || source.port || 8765),
    pollSeconds: Number(source.poll_seconds || 60),
    historyDays: Number(source.history_days || 14),
    workspaces,
    problems,
  };
};
