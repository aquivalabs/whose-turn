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

/** Set a field, or drop it when emptied, so the saved config stays minimal. */
export const setOrDrop = (
  target: Record<string, unknown>,
  key: string,
  value: string | string[],
) => {
  if (value && value.length) {
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

const OPERATOR_SIGNS: Record<string, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  prefix: 'starts with',
};
const presentText = (fact: string, operand: unknown) =>
  `${fact} is ${operand ? 'present' : 'absent'}`;

const conditionText = (fact: string, condition: unknown) => {
  if (Array.isArray(condition)) {
    return `${fact} in ${condition.join(', ')}`;
  }
  if (condition && typeof condition === 'object') {
    return Object.entries(condition)
      .map(([operator, operand]) =>
        operator === 'present'
          ? presentText(fact, operand)
          : `${fact} ${OPERATOR_SIGNS[operator]} ${JSON.stringify(operand)}`,
      )
      .join(' and ');
  }
  return `${fact} = ${condition}`;
};

/** One rules-table row as two plain texts for the read-only list in the settings sheet. */
export const ruleText = (row: RuleRow) => ({
  when:
    Object.entries(row.when)
      .map(([fact, condition]) => conditionText(fact, condition))
      .join(' and ') || 'anything else',
  then: row.then.whose === 'hidden' ? 'hidden' : `${row.then.whose}: ${row.then.next}`,
});
