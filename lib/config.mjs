/** Loads the workspace config: data directory, defaults, and the list of workspaces, each with its connector entries and rules. */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { isObject } from './text.mjs';
import { isHex, derivedSeeds } from './palette.mjs';
import { statusGroups } from './facts.mjs';
import { tableProblems, tableWarnings } from './table.mjs';
import { DEFAULT_LIMITS } from './health.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
import { HIDDEN_MODES } from './backoff.mjs';

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
    release: ['ready for release', 'ready to release', 'awaiting release'],
    on_hold: ['on hold', 'blocked'],
    backlog: ['backlog'],
  },
  automation_authors: ['automation'],
  backlog_rows: 'hide',
  question_words: ['please', 'pls', 'can you', 'could you', 'would you', 'let me know', 'need you', 'need your', 'thoughts', 'recommend', 'advise', 'confirm', 'clarify'],
};

const DEFAULT_KEY_PATTERN = '\\b[A-Z][A-Z0-9_]+-\\d+\\b';

/** What a settings form or Claude may edit on a workspace, beyond its connectors: one entry per field, neutral wording. */
export const WORKSPACE_FIELDS = {
  workspace: [
    { key: 'id', label: 'Id', hint: 'short, used in the API and on disk', required: true },
    { key: 'name', label: 'Name' },
    { key: 'key_pattern', label: 'Ticket key pattern', hint: 'regex for keys in PR titles and to-dos; empty matches any Jira-style key' },
    { key: 'links', label: 'Quick links', hint: 'one per entry as "Label https://…", comma-separated; the repository, Jira site and Linear project come by themselves', list: true },
  ],
  theme: [
    { key: 'seed', label: 'Seed colour', hint: 'the scheme is derived from it; empty derives one from the workspace id', colour: true },
    { key: 'accent', label: 'Accent colour', hint: 'optional second hue', colour: true },
    { key: 'backdrop', label: 'Backdrop animal', hint: 'draw the dotted animal behind the window', boolean: true, default: true },
  ],
  rules: [
    { key: 'approved_next', label: 'Next step when the PR is approved', hint: 'shown when a PR under review is approved' },
    { key: 'approved_release_next', label: 'Next step when a release PR is approved', hint: 'same, for a PR into a branch with the release prefix' },
    { key: 'release_branch_prefix', label: 'Release branch prefix' },
    { key: 'passed_next', label: 'Next step when the ticket has passed', hint: 'shown when the ticket reached a passed status' },
    { key: 'merged_next', label: 'Next step when the PR is merged', hint: 'shown when the PR is merged and the ticket is still on you' },
    { key: 'automation_authors', label: 'Automation authors', hint: 'comment authors to ignore', list: true },
    { key: 'backlog_rows', label: 'Backlog tickets', choices: ['hide', 'list'], hint: 'hide, or list: show them under Waiting on others as a plain task list, for a project you run alone' },
  ],
  statuses: [
    { key: 'code_review', label: 'Review statuses', list: true },
    { key: 'qa', label: 'Testing statuses', list: true },
    { key: 'passed', label: 'Passed statuses', list: true },
    { key: 'release', label: 'Release statuses', list: true },
    { key: 'on_hold', label: 'On hold statuses', list: true },
    { key: 'backlog', label: 'Backlog statuses', list: true },
  ],
};

/** The monitor-wide numbers the settings sheet and Claude may edit, with their defaults: how often to poll, how far back the feed reaches, and when a health alert fires. */
export const GLOBAL_SETTINGS = {
  poll_seconds: { fallback: 60, min: 15, max: 3600, label: 'Poll every (seconds)', hint: 'how often every workspace is polled' },
  history_days: { fallback: 14, min: 1, max: 365, label: 'History (days)', hint: 'how far back the feed and the mentions reach', whole: true },
  stale_minutes: { fallback: DEFAULT_LIMITS.stale_minutes, min: 1, max: 1440, label: 'Stale after (minutes)', hint: 'alert when no source has answered for this long' },
  failing_polls: { fallback: DEFAULT_LIMITS.failing_polls, min: 1, max: 100, label: 'Failing polls in a row', hint: 'alert when one source fails this many polls in a row', whole: true },
};

const settingProblem = (key, value) => {
  const spec = GLOBAL_SETTINGS[key];
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max && !(spec.whole && !Number.isInteger(value));
  return valid ? null : `${key} must be a ${spec.whole ? 'whole ' : ''}number from ${spec.min} to ${spec.max}`;
};

// README.md § Workspaces and connectors, the four monitor-wide numbers
const normaliseSettings = (source, problems) => Object.fromEntries(Object.entries(GLOBAL_SETTINGS).map(([key, spec]) => {
  const value = source[key];
  const problem = value === undefined ? null : settingProblem(key, value);
  if (problem) {
    problems.push(`${problem}; using ${spec.fallback}.`);
  }
  return [key, value === undefined || problem ? spec.fallback : value];
}));

/** Field violations for a `settings` object: unknown keys, and values that are not numbers within the key's min and max (whole numbers where the key says so). */
export const settingsViolations = (settings) => {
  if (!isObject(settings)) {
    return [{ field: 'settings', description: 'settings must be an object.' }];
  }
  return Object.entries(settings).flatMap(([key, value]) => {
    const spec = GLOBAL_SETTINGS[key];
    if (!spec) {
      return [{ field: `settings.${key}`, description: `${key} is not a setting; the settings are ${Object.keys(GLOBAL_SETTINGS).join(', ')}.` }];
    }
    const problem = settingProblem(key, value);
    return problem ? [{ field: `settings.${key}`, description: `${problem}.` }] : [];
  });
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

const normaliseRules = (rules, problems, workspaceId, warnings) => {
  const merged = /** @type {any} */ (mergeRules(rules));
  const issues = tableProblems(merged.table, statusGroups(merged.statuses));
  if (issues.length) {
    problems.push(...issues.map((issue) => `Workspace "${workspaceId}": ${issue}; the table is ignored.`));
    delete merged.table;
  } else {
    warnings.push(...tableWarnings(merged.table));
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
  return list.filter(isObject).map((entry) => ({ ...entry, id: String(entry.id || entry.type) }));
};

const normaliseTheme = (theme, problems, workspaceId) => {
  if (!theme) {
    return null;
  }
  const backdrop = theme.backdrop === false ? { backdrop: false } : {};
  if (theme.backdrop !== undefined && typeof theme.backdrop !== 'boolean') {
    problems.push(`Workspace "${workspaceId}": theme.backdrop must be true or false; the backdrop stays on.`);
  }
  if (theme.seed === undefined && theme.accent === undefined) {
    return Object.keys(backdrop).length ? backdrop : null;
  }
  if (!isHex(theme.seed)) {
    problems.push(`Workspace "${workspaceId}": theme.seed must be a hex colour like #3d7a5c; the theme is ignored.`);
    return Object.keys(backdrop).length ? backdrop : null;
  }
  if (theme.accent !== undefined && !isHex(theme.accent)) {
    problems.push(`Workspace "${workspaceId}": theme.accent must be a hex colour like #c27a2c; the accent is ignored.`);
  }
  return { seed: theme.seed.toLowerCase(), ...(isHex(theme.accent) ? { accent: theme.accent.toLowerCase() } : {}), ...backdrop };
};

const normaliseLinks = (links) => (Array.isArray(links) ? links : []).map((entry) => {
  if (typeof entry === 'string') {
    const match = /^(.*?)\s*(https?:\/\/\S+)$/.exec(entry.trim());
    return match ? { label: match[1].trim() || match[2].replace(/^https?:\/\//, ''), url: match[2] } : null;
  }
  return entry && /^https?:\/\//.test(String(entry.url || '')) ? { label: String(entry.label || entry.url), url: String(entry.url) } : null;
}).filter(Boolean);

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

const violation = (field, description) => ({ field, description });

const fieldProblems = (workspace, id, index) => {
  const problems = [];
  const where = `Workspace "${id}"`;
  const at = `workspaces[${index}]`;
  if (workspace.key_pattern) {
    try {
      new RegExp(workspace.key_pattern);
    } catch (error) {
      problems.push(violation(`${at}.key_pattern`, `${where}: key_pattern is not a valid regular expression: ${error.message}`));
    }
  }
  if (workspace.hidden !== undefined && !HIDDEN_MODES.includes(workspace.hidden)) {
    problems.push(violation(`${at}.hidden`, `${where}: hidden must be one of ${HIDDEN_MODES.join(', ')}, or left out.`));
  }
  const rules = workspace.rules || {};
  const backlogChoices = WORKSPACE_FIELDS.rules.find((field) => field.key === 'backlog_rows').choices;
  if (rules.backlog_rows !== undefined && !backlogChoices.includes(rules.backlog_rows)) {
    problems.push(violation(`${at}.rules.backlog_rows`, `${where}: rules.backlog_rows must be one of ${backlogChoices.join(', ')}.`));
  }
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
  connectorEntries(workspace.connectors).forEach((entry, position) => {
    for (const field of CONNECTORS[entry.type]?.fields || []) {
      const fieldAt = `${at}.connectors[${position}].${field.key}`;
      if (field.boolean && entry[field.key] !== undefined && typeof entry[field.key] !== 'boolean') {
        problems.push(violation(fieldAt, `${where}: connector "${entry.id}": ${field.key} must be true or false.`));
      }
      if (field.choices && entry[field.key] !== undefined && !field.choices.includes(entry[field.key])) {
        problems.push(violation(fieldAt, `${where}: connector "${entry.id}": ${field.key} must be one of ${field.choices.join(', ')}.`));
      }
    }
  });
  return problems;
};

const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const normaliseWorkspace = (workspace, index, problems, warnings) => {
  const missing = workspace.id === undefined || workspace.id === null;
  const id = String(missing ? `ws${index + 1}` : workspace.id);
  if (!missing && !(typeof workspace.id === 'string' && WORKSPACE_ID.test(id))) {
    const description = id
      ? `Workspace ${index + 1}: the id "${id}" must be 1 to 40 lowercase letters, digits or hyphens, starting with a letter or digit.`
      : `Workspace ${index + 1}: the id is required.`;
    problems.push(violation(`workspaces[${index}].id`, description));
  }
  problems.push(...fieldProblems(workspace, id, index));
  const tableNotes = [];
  const rules = normaliseRules(workspace.rules, problems, id, tableNotes);
  if (tableNotes.length) {
    warnings[id] = tableNotes;
  }
  return /** @type {any} */ ({
    id,
    links: normaliseLinks(workspace.links),
    name: String(workspace.name || workspace.id || `Workspace ${index + 1}`),
    connectors: connectorEntries(workspace.connectors),
    rules,
    key_pattern: workspace.key_pattern || DEFAULT_KEY_PATTERN,
    theme: normaliseTheme(workspace.theme, problems, id),
    ...(HIDDEN_MODES.includes(workspace.hidden) ? { hidden: workspace.hidden } : {}),
  });
};

export const loadConfig = (env = process.env) => {
  const dataDir = env.WHOSE_TURN_DATA || defaultDataDir();
  const configFile = env.WHOSE_TURN_CONFIG || join(dataDir, 'config.json');
  const raw = readJson(configFile);
  const problems = [];
  if (raw === null) {
    problems.push(`No workspace config yet: add a source in the workspace settings (top right of the workspace). It will be written to ${configFile}.`);
  } else if (raw.parse_error) {
    problems.push(`Cannot parse ${configFile}: ${raw.parse_error}`);
  }
  const source = raw && !raw.parse_error ? raw : {};
  const rawWorkspaces = Array.isArray(source.workspaces) ? source.workspaces : [legacyWorkspace(source)];
  const { workspaces: normalised, problems: shapeProblems, warnings } = normaliseWorkspaces(rawWorkspaces);
  const warningLines = Object.entries(warnings).flatMap(([id, lines]) => lines.map((line) => `Workspace "${id}": ${line}.`));
  const workspaces = normalised.filter((workspace) => WORKSPACE_ID.test(workspace.id));
  const settings = normaliseSettings(source, problems);
  const { poll_seconds: pollSeconds, history_days: historyDays, ...health } = settings;
  return {
    dataDir,
    configFile,
    port: resolvePort(dataDir, env),
    pollSeconds,
    historyDays,
    health,
    settings,
    feedback: withoutRetiredFeedbackKeys(source.feedback),
    release: isObject(source.release) ? source.release : {},
    notifications: normaliseNotifications(source.notifications, problems),
    workspaces,
    rawWorkspaces,
    problems: [...problems, ...shapeProblems, ...warningLines],
  };
};

/** The boolean `desktop` of a notifications block, or undefined. */
export const desktopOf = (notifications) => (isObject(notifications) && typeof notifications.desktop === 'boolean' ? notifications.desktop : undefined);

const normaliseNotifications = (notifications, problems) => {
  if (notifications === undefined) {
    return { desktop: true };
  }
  const desktop = desktopOf(notifications);
  if (desktop === undefined) {
    problems.push('notifications.desktop must be true or false; desktop notifications stay on.');
  }
  return { desktop: desktop ?? true };
};

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
  const warnings = {};
  const list = Array.isArray(rawWorkspaces) ? rawWorkspaces : [];
  const workspaces = list.map((workspace, index) => normaliseWorkspace(isObject(workspace) ? workspace : {}, index, problems, warnings));
  const toViolation = (problem) => (typeof problem === 'string' ? violation('workspaces', problem) : problem);
  const seeds = derivedSeeds(workspaces.map((workspace) => ({ id: workspace.id, seed: workspace.theme?.seed })));
  for (const workspace of workspaces) {
    if (seeds[workspace.id]) {
      workspace.derived_seed = seeds[workspace.id];
    }
  }
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
  if (workspaces.length && workspaces.every((workspace) => workspace.hidden)) {
    problems.push('Keep at least one workspace in the rail: parked and paused workspaces are out of it.');
  }
  const violations = problems.map(toViolation);
  return { workspaces, problems: violations.map((entry) => entry.description), violations, warnings };
};

const RETIRED_FEEDBACK_KEYS = ['workspace', 'team', 'project', 'token_service', 'assign'];

const withoutRetiredFeedbackKeys = (feedback) => (isObject(feedback) ? Object.fromEntries(Object.entries(feedback).filter(([key]) => !RETIRED_FEEDBACK_KEYS.includes(key))) : {});

const storedConfig = (configFile) => {
  const current = readJson(configFile);
  return current && !current.parse_error ? current : {};
};

/** Writes `patch` over the config file's top-level keys and leaves every other key as it is; an unparsable file is replaced, the previous one stays as config.json.bak. */
const mergeIntoConfig = (configFile, patch) => writeConfig(configFile, { ...storedConfig(configFile), ...patch });

/** Writes the workspace list into the config file; the previous file stays as config.json.bak. */
export const saveWorkspaces = (configFile, rawWorkspaces) => {
  const source = storedConfig(configFile);
  delete source.github;
  delete source.jira;
  delete source.rules;
  const feedback = withoutRetiredFeedbackKeys(source.feedback);
  if (Object.keys(feedback).length) {
    source.feedback = feedback;
  } else {
    delete source.feedback;
  }
  writeConfig(configFile, { ...source, workspaces: rawWorkspaces });
};

/** Writes the validated notifications block into the config file. */
export const saveNotifications = (configFile, notifications) => mergeIntoConfig(configFile, { notifications });

/** Writes the validated monitor-wide numbers (poll_seconds, history_days, stale_minutes, failing_polls) into the config file, leaving every other key as it is. */
export const saveSettings = (configFile, settings) => mergeIntoConfig(configFile, settings);

const writeConfig = (configFile, next) => {
  mkdirSync(dirname(configFile), { recursive: true });
  if (existsSync(configFile)) {
    writeFileSync(`${configFile}.bak.tmp`, readFileSync(configFile));
    renameSync(`${configFile}.bak.tmp`, `${configFile}.bak`);
  }
  writeFileSync(`${configFile}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${configFile}.tmp`, configFile);
};
