// The settings form's shaping: what the server's raw workspace becomes in the form, and what goes back.
import { toRaw } from 'vue';
import type { ConnectorEntry, FactWords, RawWorkspace, RuleRow } from './types.ts';
import { text, type TextKey } from '../i18n/index.ts';

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

/** Sets a field, or drops it when emptied; a boolean is always kept. */
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

const STATUS_KEYS: Record<string, TextKey> = {
  backlog: 'core.rules.status.backlog',
  passed: 'core.rules.status.passed',
  release: 'core.rules.status.release',
  code_review: 'core.rules.status.codeReview',
  qa: 'core.rules.status.qa',
  on_hold: 'core.rules.status.onHold',
  todo: 'core.rules.status.todo',
  in_progress: 'core.rules.status.inProgress',
  done: 'core.rules.status.done',
};
/** The text a lookup table holds for `value`, or `fallback()` when the table has none. */
const phrase = (map: Record<string, TextKey>, value: string, fallback: () => string) =>
  map[value] ? text(map[value]) : fallback();

const statusPhrase = (group: string) =>
  phrase(STATUS_KEYS, group, () => text('core.rules.status.other', { group: group.replace(/_/g, ' ') }));

const WHOSE_KEYS: Record<string, TextKey> = {
  you: 'core.rules.whose.you',
  reviewer: 'core.rules.whose.reviewer',
  qa: 'core.rules.whose.qa',
  them: 'core.rules.whose.them',
};

const factName = (facts: FactWords, fact: string) =>
  facts[fact]?.name || fact.replace(/[._]/g, ' ');

const REVIEW_KEYS: Record<string, TextKey> = {
  approved: 'core.rules.review.approved',
  changes_requested: 'core.rules.review.changesRequested',
  none: 'core.rules.review.none',
};

const valuePhrase = (facts: FactWords, fact: string, value: unknown): string => {
  switch (fact) {
    case 'ticket.status':
      return text('core.rules.ticketIs', { phrase: statusPhrase(String(value)) });
    case 'ticket.assignee':
      return value === 'me' ? text('core.rules.ticketOnYou') : text('core.rules.ticketAssigned', { value });
    case 'pr.checks':
      return value === 'none' ? text('core.rules.noChecks') : text('core.rules.checksAre', { value });
    case 'pr.review':
      return phrase(REVIEW_KEYS, String(value), () => text('core.rules.review.other', { value }));
    case 'pr.base':
      return text('core.rules.goesInto', { value });
    default:
      return text('core.rules.factIs', { fact: factName(facts, fact), value });
  }
};

const BOUND_KEYS: Record<string, TextKey> = { gt: 'core.rules.moreThan', gte: 'core.rules.atLeast', lt: 'core.rules.fewerThan', lte: 'core.rules.atMost' };
const SIGN_KEYS: Record<string, TextKey> = { gt: 'core.rules.sign.gt', gte: 'core.rules.sign.gte', lt: 'core.rules.sign.lt', lte: 'core.rules.sign.lte' };

const operatorPhrase = (facts: FactWords, fact: string, operator: string, operand: unknown) => {
  const name = factName(facts, fact);
  if (operator === 'present') {
    return operand ? text('core.rules.factGiven', { fact: name }) : text('core.rules.factMissing', { fact: name });
  }
  if (operator === 'prefix') {
    return fact === 'pr.base' ? text('core.rules.goesIntoPrefix', { operand }) : text('core.rules.factStarts', { fact: name, operand });
  }
  if (fact === 'unanswered_count') {
    return text('core.rules.mentionsWait', { bound: text(BOUND_KEYS[operator], { count: Number(operand) }) });
  }
  return text('core.rules.factCompares', { fact: name, sign: text(SIGN_KEYS[operator]), operand });
};

const conditionText = (facts: FactWords, fact: string, condition: unknown): string => {
  if (Array.isArray(condition)) {
    return fact === 'ticket.status'
      ? text('core.rules.ticketIs', { phrase: condition.map((group) => statusPhrase(String(group))).join(text('core.rules.or')) })
      : text('core.rules.factIs', { fact: factName(facts, fact), value: condition.join(text('core.rules.or')) });
  }
  if (condition && typeof condition === 'object') {
    return Object.entries(condition)
      .map(([operator, operand]) => operatorPhrase(facts, fact, operator, operand))
      .join(text('core.rules.and'));
  }
  const says = facts[fact]?.says;
  if (typeof condition === 'boolean' && says) {
    return says[condition ? 0 : 1];
  }
  return valuePhrase(facts, fact, condition);
};

const nextText = (facts: FactWords, next: string) =>
  next.replace(/\{([\w.]+)\}/g, (match, fact: string) => `{${factName(facts, fact)}}`);

/** One rules-table row as a sentence pair for the read-only list in the settings sheet. */
export const ruleText = (row: RuleRow, facts: FactWords = {}) => {
  const conditions = Object.entries(row.when).map(([fact, condition]) =>
    conditionText(facts, fact, condition),
  );
  const outcome =
    row.then.whose === 'hidden'
      ? text('core.rules.notShown')
      : text('core.rules.outcome', { whose: phrase(WHOSE_KEYS, row.then.whose, () => row.then.whose), next: nextText(facts, row.then.next || '') });
  return {
    when: conditions.length ? text('core.rules.when', { conditions: conditions.join(text('core.rules.and')) }) : text('core.rules.otherwise'),
    then: outcome,
  };
};
