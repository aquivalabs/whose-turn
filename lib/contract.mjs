/** The connector contract, version 1: the kinds a source may supply, the shape of each, and the checks an adapter and its poll result go through. See docs/mechanisms/connector-contract.md. */
import { Adapter } from './adapter.mjs';
import { isObject } from './text.mjs';

export const CONTRACT_VERSION = 1;

/** Every kind of data the core merges and the rules read, in merge order. */
export const KINDS = ['tickets', 'comments', 'prs', 'activity', 'asks', 'runs'];

const text = { type: 'string' };
const optionalText = { type: 'string', optional: true };
const url = { type: 'string', url: true };
const time = { type: 'string', time: true };
const flag = { type: 'boolean' };
const idValue = { type: ['string', 'number'] };
const labels = { type: 'array', optional: true, strings: true };

/** The normalised shape of one item of each kind: field → its type, and the closed values when there are any. */
export const SHAPES = {
  tickets: {
    key: text, summary: text, status: text, status_category: { type: 'string', values: ['new', 'indeterminate', 'done'] }, assignee: text, updated: time, url,
    status_change: { type: 'object', optional: true }, labels,
  },
  comments: { id: idValue, key: text, at: time, author: text, body: text, url },
  prs: {
    pr: { type: 'number' }, key: text, title: text, base: text, state: { type: 'string', values: ['OPEN', 'CLOSED', 'MERGED'] },
    review: { type: 'string', values: ['', 'APPROVED', 'CHANGES_REQUESTED'] }, checks: { type: 'string', values: ['passing', 'failing', 'running', 'none'] },
    merged_at: text, updated_at: time, url, last_comment_by: text, last_comment_at: text, last_comment_url: url, last_comment: text, unanswered: flag, labels,
  },
  activity: { at: time, pr: text, key: text, title: optionalText, kind: text, who: text, url, text, body: optionalText },
  asks: { id: text, ref: text, title: text, key: text, kind: { type: 'string', values: ['review requested', 'mentioned you'] }, who: text, at: time, url, text, body: text },
  runs: { id: idValue, ref: text, workflow: text, branch: text, failed: flag, mine: flag, actor: text, title: text, url, at: time, streak: idValue },
};

/** A poll result with every item of every kind marked with the entry it came from, as the workspace merges it. */
export const stamp = (result, sourceId) => {
  const stamped = { ...result };
  for (const kind of KINDS) {
    stamped[kind] = (result[kind] || []).map((item) => ({ ...item, source: sourceId }));
  }
  return stamped;
};

const ADAPTER_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_PROBLEMS = 10;

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

const fieldProblem = (value, spec) => {
  if (value === undefined || value === null) {
    return spec.optional ? '' : 'is missing';
  }
  const types = [spec.type].flat();
  if (!types.includes(typeOf(value))) {
    return `must be ${types.join(' or ')}, got ${typeOf(value)}`;
  }
  if (spec.strings && value.some((entry) => typeof entry !== 'string')) {
    return 'must be a list of strings';
  }
  if (spec.values && !spec.values.includes(value)) {
    return `must be one of ${spec.values.map((choice) => JSON.stringify(choice)).join(', ')}, got ${JSON.stringify(value)}`;
  }
  if (spec.url && value && !value.startsWith('https://')) {
    return 'must be empty or start with https://';
  }
  if (spec.time && value && Number.isNaN(Date.parse(value))) {
    return `must be an ISO date-time, got ${JSON.stringify(value)}`;
  }
  return '';
};

/** What is wrong with one item of `kind`, as `kind[index].field: problem` lines. */
export const itemProblems = (kind, item, index) => {
  if (!isObject(item)) {
    return [`${kind}[${index}] must be an object`];
  }
  return Object.entries(SHAPES[kind]).map(([field, spec]) => [field, fieldProblem(item[field], spec)]).filter(([, problem]) => problem).map(([field, problem]) => `${kind}[${index}].${field} ${problem}`);
};

const fieldsProblems = (fields) => {
  if (!Array.isArray(fields)) {
    return ['fields must be a list of { key, label } (an empty list is fine)'];
  }
  return fields.flatMap((field, index) => (isObject(field) && typeof field.key === 'string' && typeof field.label === 'string' ? [] : [`fields[${index}] needs a string key and a string label`]));
};

/** What stops a loaded module from being a connector under this contract; empty when it is one. */
export const adapterProblems = (adapter) => {
  const problems = [];
  if (adapter.contract !== CONTRACT_VERSION) {
    problems.push(adapter.contract === undefined
      ? `contract = ${CONTRACT_VERSION} is missing`
      : `contract ${JSON.stringify(adapter.contract)} is not supported; this server speaks contract ${CONTRACT_VERSION}`);
  }
  if (typeof adapter.id !== 'string' || !ADAPTER_ID.test(adapter.id)) {
    problems.push('id must be 1 to 40 lowercase letters, digits or hyphens, starting with a letter');
  }
  if (typeof adapter.label !== 'string' || !adapter.label.trim()) {
    problems.push('label must be a non-empty string');
  }
  const capabilities = adapter.capabilities;
  if (!Array.isArray(capabilities) || !capabilities.length) {
    problems.push(`capabilities must be a non-empty list of ${KINDS.join(', ')}`);
  } else {
    for (const kind of capabilities.filter((candidate) => !KINDS.includes(candidate))) {
      problems.push(`capability ${JSON.stringify(kind)} is unknown; contract ${CONTRACT_VERSION} knows ${KINDS.join(', ')}`);
    }
  }
  problems.push(...fieldsProblems(adapter.fields));
  if (typeof adapter.poll !== 'function') {
    problems.push('poll must be an exported async function');
  } else if (adapter instanceof Adapter && adapter.poll === Adapter.prototype.poll) {
    problems.push('poll(context) must be implemented; the base Adapter only refuses');
  }
  return problems;
};

/** What is wrong with one poll result of a source that declared `capabilities`, capped at ten lines with a count of the rest. */
export const resultProblems = (result, capabilities) => {
  if (typeOf(result) !== 'object') {
    return [`poll must resolve to an object, got ${typeOf(result)}`];
  }
  const problems = [];
  if (result.me !== undefined && typeof result.me !== 'string') {
    problems.push('me must be a string');
  }
  if (result.errors !== undefined && (!isObject(result.errors) || Object.values(result.errors).some((message) => typeof message !== 'string'))) {
    problems.push('errors must be an object of strings, part → message');
  }
  for (const kind of KINDS.filter((candidate) => result[candidate] !== undefined)) {
    if (!capabilities.includes(kind)) {
      problems.push(`returns ${kind} but does not declare it in capabilities`);
    } else if (!Array.isArray(result[kind])) {
      problems.push(`${kind} must be a list`);
    } else {
      problems.push(...result[kind].flatMap((item, index) => itemProblems(kind, item, index)));
    }
  }
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${problems.length - MAX_PROBLEMS} more`] : problems;
};

/** A contract violation: the adapter or its result does not follow the contract; the message names each problem. */
export class ContractError extends Error {
  constructor(subject, problems) {
    super(`${subject} does not follow connector contract ${CONTRACT_VERSION}: ${problems.join('; ')}`);
    this.name = 'ContractError';
    this.problems = problems;
  }
}
