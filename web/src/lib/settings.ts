// The settings form's shaping: what the server's raw workspace becomes in the form, and what goes back.
import { toRaw } from 'vue';
import type { ConnectorEntry, RawWorkspace, RuleRow } from './types.ts';

/** A raw workspace as config.json may hold it: connectors as a list or keyed by type, rules and theme optional. */
export interface StoredWorkspace {
  id: string;
  name?: string;
  connectors?: ConnectorEntry[] | Record<string, Omit<ConnectorEntry, 'type'>>;
  rules?: Partial<RawWorkspace['rules']>;
  theme?: Record<string, unknown>;
  [field: string]: unknown;
}

export const normaliseForForm = (stored: StoredWorkspace): RawWorkspace => {
  const copy = structuredClone(toRaw(stored));
  const connectors = copy.connectors || {};
  const rules = copy.rules || {};
  rules.statuses = rules.statuses || {};
  return {
    ...copy,
    connectors: Array.isArray(connectors)
      ? connectors
      : Object.entries(connectors).map(([type, entry]) => ({ type, ...entry })),
    rules: rules as RawWorkspace['rules'],
    theme: copy.theme || {},
  };
};

export const forSaving = (workspace: RawWorkspace): StoredWorkspace => {
  const copy: StoredWorkspace = structuredClone(toRaw(workspace));
  if (copy.theme && !Object.keys(copy.theme).length) {
    delete copy.theme;
  }
  if (copy.rules && !Object.keys(copy.rules.statuses || {}).length) {
    delete copy.rules.statuses;
  }
  if (copy.rules && !Object.keys(copy.rules).length) {
    delete copy.rules;
  }
  return copy;
};

const uids = new WeakMap<object, number>();
let lastUid = 0;
/** A stable key for a workspace or connector entry in the form: assigned on first sight, kept beside the object so it never reaches the saved config. */
export const uidOf = (item: object) => {
  const raw = toRaw(item);
  let uid = uids.get(raw);
  if (!uid) {
    uid = ++lastUid;
    uids.set(raw, uid);
  }
  return uid;
};

/** The form's list as one string, read through the reactive proxy so a computed tracks every edit, to compare with the copy taken at load. */
export const settingsKey = (list: RawWorkspace[]) => JSON.stringify(list);

export interface PendingSecret {
  ws: string;
  connector: string;
  key: string;
  value: string;
}

/** The secrets typed into the form, each addressed to its workspace and connector entry. */
export const pendingSecrets = (
  list: RawWorkspace[],
  typed: Map<ConnectorEntry, Record<string, string>>,
) => {
  const out: PendingSecret[] = [];
  list.forEach((workspace) =>
    workspace.connectors.forEach((entry) => {
      const values = typed.get(entry) || {};
      Object.keys(values).forEach((key) => {
        if (values[key]) {
          out.push({
            ws: workspace.id,
            connector: entry.id || entry.type,
            key,
            value: values[key],
          });
        }
      });
    }),
  );
  return out;
};

/** Set a field, or drop it when emptied (a boolean is always kept; FieldRow sends undefined for the default), so the saved config stays minimal. */
export const setOrDrop = (
  target: Record<string, unknown>,
  key: string,
  value: string | string[] | boolean | undefined,
) => {
  if (typeof value === 'boolean' || (value && value.length)) {
    target[key] = value;
  } else {
    delete target[key];
  }
};

/** The raw workspace entries in the order of the given ids; entries not named keep their place at the end. */
export const orderWorkspaces = <T extends { id: string }>(raw: T[], ids: string[]) => {
  const position = (workspace: T) => {
    const at = ids.indexOf(workspace.id);
    return at < 0 ? ids.length : at;
  };
  return [...raw].sort((first, second) => position(first) - position(second));
};

/** The ids after dropping one workspace before or after another. */
export const movedIds = (ids: string[], dragged: string, target: string, before: boolean) => {
  const rest = ids.filter((id) => id !== dragged);
  rest.splice(rest.indexOf(target) + (before ? 0 : 1), 0, dragged);
  return rest;
};

const STATUS_PHRASES: Record<string, string> = {
  backlog: 'in the backlog',
  passed: 'passed',
  code_review: 'in review',
  qa: 'in testing',
  on_hold: 'on hold',
  todo: 'to do',
  in_progress: 'in progress',
  done: 'done',
};
const statusPhrase = (group: string) => STATUS_PHRASES[group] || `in ${group.replace(/_/g, ' ')}`;

const WHOSE_PHRASES: Record<string, string> = {
  you: 'your move',
  reviewer: "the reviewer's move",
  qa: "the tester's move",
  them: 'waiting on others',
};

const FACT_NAMES: Record<string, string> = {
  'ticket.hold_reason': 'the hold reason',
  'ticket.status_name': 'the status',
  'ticket.key': 'the ticket key',
  'pr.number': 'the PR number',
  'pr.base': 'the target branch',
  'pr.commenter': 'the commenter',
  'run.workflow': 'the workflow',
  'run.branch': 'the branch',
  'comment.author': 'the author',
};
const factName = (fact: string) => FACT_NAMES[fact] || fact.replace(/[._]/g, ' ');

const flag = (operand: unknown, whenTrue: string, whenFalse: string) =>
  operand ? whenTrue : whenFalse;

const REVIEW_PHRASES: Record<string, string> = {
  approved: 'the PR is approved',
  changes_requested: 'changes are requested on the PR',
  none: 'the PR has no review',
};

const valuePhrase = (fact: string, value: unknown): string => {
  switch (fact) {
    case 'ticket.status':
      return `the ticket is ${statusPhrase(String(value))}`;
    case 'ticket.assignee':
      return value === 'me' ? 'the ticket is on you' : `the ticket is assigned to ${value}`;
    case 'pr.checks':
      return value === 'none' ? 'the PR has no checks' : `the PR checks are ${value}`;
    case 'pr.review':
      return REVIEW_PHRASES[String(value)] || `the PR review is ${value}`;
    case 'pr.base':
      return `the PR goes into ${value}`;
    default:
      return `${factName(fact)} is ${value}`;
  }
};

const FLAG_PHRASES: Record<string, [string, string]> = {
  'ticket.done': ['the ticket is done', 'the ticket is not done'],
  'ticket.started': ['the ticket is started', 'the ticket is not started'],
  'pr.open': ['the PR is open', 'no PR is open'],
  'pr.merged': ['the PR is merged', 'the PR is not merged'],
  'pr.unanswered': ['a comment on the PR waits for your answer', 'no comment on the PR waits for your answer'],
  'comment.mentions_me': ['you are mentioned and have not answered', 'no mention of you waits for an answer'],
  'comment.is_question': ['the mention is a question', 'the mention is not a question'],
  'run.failed': ['a workflow run failed', 'no workflow run failed'],
  'run.mine': ['the run is yours', 'the run is not yours'],
};

const operatorPhrase = (fact: string, operator: string, operand: unknown) => {
  if (operator === 'present') {
    return flag(operand, `${factName(fact)} is given`, `${factName(fact)} is missing`);
  }
  if (operator === 'prefix') {
    return fact === 'pr.base'
      ? `the PR goes into a branch starting with ${operand}`
      : `${factName(fact)} starts with ${operand}`;
  }
  if (fact === 'unanswered_count') {
    const count = Number(operand);
    const bounds: Record<string, string> = {
      gt: `more than ${count}`,
      gte: `at least ${count}`,
      lt: `fewer than ${count}`,
      lte: `at most ${count}`,
    };
    return `${bounds[operator]} mentions of you wait for an answer`;
  }
  const signs: Record<string, string> = { gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most' };
  return `${factName(fact)} is ${signs[operator]} ${operand}`;
};

const conditionText = (fact: string, condition: unknown): string => {
  if (Array.isArray(condition)) {
    return fact === 'ticket.status'
      ? `the ticket is ${condition.map((group) => statusPhrase(String(group))).join(' or ')}`
      : `${factName(fact)} is ${condition.join(' or ')}`;
  }
  if (condition && typeof condition === 'object') {
    return Object.entries(condition)
      .map(([operator, operand]) => operatorPhrase(fact, operator, operand))
      .join(' and ');
  }
  if (typeof condition === 'boolean' && FLAG_PHRASES[fact]) {
    return FLAG_PHRASES[fact][condition ? 0 : 1];
  }
  return valuePhrase(fact, condition);
};

const nextText = (next: string) => next.replace(/\{([\w.]+)\}/g, (match, fact: string) => `{${factName(fact)}}`);

/** One rules-table row as a sentence pair for the read-only list in the settings sheet. */
export const ruleText = (row: RuleRow) => {
  const conditions = Object.entries(row.when).map(([fact, condition]) =>
    conditionText(fact, condition),
  );
  const outcome =
    row.then.whose === 'hidden'
      ? 'not shown'
      : `${WHOSE_PHRASES[row.then.whose] || row.then.whose}, "${nextText(row.then.next || '')}"`;
  return {
    when: conditions.length ? `When ${conditions.join(' and ')}:` : 'In every other case:',
    then: outcome,
  };
};
