/** The rules table: validating rows, expanding the "default" marker, finding the first row whose conditions hold, filling {fact} placeholders. See docs/mechanisms/rules-table.md. */
import { FACTS } from './facts.mjs';

/** `then.whose` values: the label the row shows, and the feed group it forces (none keeps the seed row's group). */
export const WHOSE = {
  you: { label: 'You', group: 'you' },
  reviewer: { label: 'Reviewer', group: null },
  qa: { label: 'QA', group: null },
  them: { label: null, group: null },
  hidden: { label: null, group: 'gone' },
};
const THEN_KEYS = ['whose', 'next', 'why', 'rank', 'started', 'hold'];
const DEFAULT_MARKER = 'default';

const present = (value) => value !== null && value !== undefined;
const NUMBER_OPERATORS = {
  gt: (value, operand) => present(value) && value > operand,
  gte: (value, operand) => present(value) && value >= operand,
  lt: (value, operand) => present(value) && value < operand,
  lte: (value, operand) => present(value) && value <= operand,
};
const OPERATORS = {
  ...NUMBER_OPERATORS,
  prefix: (value, operand) => present(value) && String(value).startsWith(operand),
  present: (value, operand) => present(value) === operand,
};
const PLACEHOLDER = /\{([\w.]+)\}/g;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const conditionHolds = (value, condition) => {
  if (Array.isArray(condition)) {
    return condition.includes(value);
  }
  if (isPlainObject(condition)) {
    return Object.entries(condition).every(([operator, operand]) => OPERATORS[operator](value, operand));
  }
  return value === condition;
};

export const firstMatch = (table, facts) => table.find((row) => Object.entries(row.when).every(([fact, condition]) => conditionHolds(facts[fact], condition)));

/** Replaces each {fact} with its value; a missing fact becomes empty text, an unknown name is left as written. */
export const fillText = (text, facts) => String(text || '').replace(PLACEHOLDER, (placeholder, name) => (name in FACTS ? String(facts[name] ?? '') : placeholder));

export const expandTable = (table, defaults) => (Array.isArray(table) ? table.flatMap((row) => (row === DEFAULT_MARKER ? defaults : [row])) : defaults);

const closedValues = (name, groups) => {
  const values = FACTS[name].values;
  return values === 'status groups' ? groups : values;
};

const valueProblem = (name, value, groups) => {
  const fact = FACTS[name];
  if (typeof value !== fact.type) {
    return `"${name}" is a ${fact.type}, got ${JSON.stringify(value)}`;
  }
  const values = closedValues(name, groups);
  return values && !values.includes(value) ? `"${name}" is one of ${values.join(', ')}, got ${JSON.stringify(value)}` : null;
};

const operatorProblem = (name, operator, operand) => {
  const type = FACTS[name].type;
  if (operator in NUMBER_OPERATORS) {
    return type === 'number' && typeof operand === 'number' ? null : `"${operator}" needs a number fact and a number, "${name}" is a ${type}`;
  }
  if (operator === 'prefix') {
    return type === 'string' && typeof operand === 'string' ? null : `"prefix" needs a text fact and a text, "${name}" is a ${type}`;
  }
  if (operator === 'present') {
    return typeof operand === 'boolean' ? null : `"present" needs true or false, got ${JSON.stringify(operand)}`;
  }
  return `unknown operator "${operator}" on "${name}"; use gt, gte, lt, lte, prefix or present`;
};

const conditionProblems = (name, condition, groups) => {
  if (!(name in FACTS)) {
    return [`unknown fact "${name}"; GET /api/config lists the facts`];
  }
  if (Array.isArray(condition)) {
    return condition.length ? condition.map((value) => valueProblem(name, value, groups)).filter(Boolean) : [`the list for "${name}" is empty`];
  }
  if (isPlainObject(condition)) {
    const entries = Object.entries(condition);
    return entries.length ? entries.map(([operator, operand]) => operatorProblem(name, operator, operand)).filter(Boolean) : [`the condition on "${name}" is an empty object`];
  }
  const problem = valueProblem(name, condition, groups);
  return problem ? [problem] : [];
};

const placeholderProblems = (text) => [...String(text).matchAll(PLACEHOLDER)].filter(([, name]) => !(name in FACTS)).map(([, name]) => `unknown fact "{${name}}" in the text`);

const thenProblems = (then) => {
  if (!isPlainObject(then)) {
    return ['"then" must be an object { whose, next, why?, rank?, started?, hold? }'];
  }
  const problems = Object.keys(then).filter((key) => !THEN_KEYS.includes(key)).map((key) => `unknown key "then.${key}"`);
  if (!(then.whose in WHOSE)) {
    problems.push(`"then.whose" is one of ${Object.keys(WHOSE).join(', ')}, got ${JSON.stringify(then.whose)}`);
  }
  for (const key of ['started', 'hold']) {
    if (then[key] !== undefined && typeof then[key] !== 'boolean') {
      problems.push(`"then.${key}" must be true or false`);
    }
  }
  if (then.rank !== undefined && !(Number.isInteger(then.rank) && then.rank >= 0)) {
    problems.push('"then.rank" must be a whole number, 0 or more');
  }
  for (const key of ['next', 'why']) {
    if (then[key] !== undefined && typeof then[key] !== 'string') {
      problems.push(`"then.${key}" must be text`);
    } else if (then[key]) {
      problems.push(...placeholderProblems(then[key]));
    }
  }
  if (then.whose !== 'hidden' && !then.next) {
    problems.push('"then.next" is required unless whose is hidden');
  }
  return problems;
};

const rowProblems = (row, groups) => {
  if (!isPlainObject(row)) {
    return [`a row is { when, then } or the text "${DEFAULT_MARKER}"`];
  }
  const problems = Object.keys(row).filter((key) => !['when', 'then'].includes(key)).map((key) => `unknown key "${key}"`);
  if (!isPlainObject(row.when)) {
    problems.push('"when" must be an object of { fact: condition }');
  } else {
    problems.push(...Object.entries(row.when).flatMap(([name, condition]) => conditionProblems(name, condition, groups)));
  }
  return [...problems, ...thenProblems(row.then)];
};

/** What is wrong with a workspace table, one line per problem, each naming its row (1-based); empty when the table is fine or absent. */
export const tableProblems = (table, groups) => {
  if (table === undefined) {
    return [];
  }
  if (!Array.isArray(table)) {
    return ['rules.table must be a list of rows'];
  }
  const problems = table.flatMap((row, index) => (row === DEFAULT_MARKER ? [] : rowProblems(row, groups).map((problem) => `rules.table row ${index + 1}: ${problem}`)));
  if (table.filter((row) => row === DEFAULT_MARKER).length > 1) {
    problems.push(`rules.table: "${DEFAULT_MARKER}" may appear once`);
  }
  return problems;
};
