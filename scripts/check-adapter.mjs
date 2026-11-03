#!/usr/bin/env node
/** Checks an adapter file against connector contract 1, polls it once and shows the rows the default rules make of it. Usage and exit codes: docs/mechanisms/connector-contract.md. */
import { parseArgs } from 'node:util';
import { loadAdapter, pollAdapter } from '../connectors/module.mjs';
import { createHttpClient } from '../lib/http-client.mjs';
import { compileRules, turnRows } from '../lib/rules.mjs';
import { DEFAULT_RULES, DEFAULT_KEY_PATTERN } from '../lib/config.mjs';
import { makeKeyFinder, daysAgoIso } from '../lib/text.mjs';
import { KINDS, stamp } from '../lib/contract.mjs';

const USAGE = 'usage: node scripts/check-adapter.mjs <adapter.mjs> [--settings \'{"key":"value"}\'] [--no-poll]\nthe token, if the adapter asks secret(), comes from WHOSE_TURN_ADAPTER_TOKEN';

const fail = (code, lines) => {
  console.error(lines.join('\n'));
  process.exit(code);
};

const { values, positionals } = parseArgs({ allowPositionals: true, options: { settings: { type: 'string', default: '{}' }, 'no-poll': { type: 'boolean', default: false } } });
if (positionals.length !== 1) {
  fail(2, [USAGE]);
}
const path = positionals[0];

let settings;
try {
  settings = JSON.parse(values.settings);
} catch (error) {
  fail(2, [`--settings is not JSON: ${error.message}`]);
}

const problemsOf = (error) => (error.name === 'ContractError' ? error.problems.map((problem) => `  - ${problem}`) : [`  ${error.name}: ${error.message}`]);

let adapter;
try {
  adapter = await loadAdapter(path);
} catch (error) {
  fail(1, [`not an adapter: ${path}`, ...problemsOf(error)]);
}
console.log(`contract ${adapter.contract} · ${adapter.id} (${adapter.label}) · supplies ${adapter.capabilities.join(', ')}`);
if (values['no-poll']) {
  process.exit(0);
}

const historyDays = 14;
let result;
try {
  result = await pollAdapter(adapter, {
    settings: { type: 'module', id: adapter.id, path, ...settings }, http: createHttpClient(), cache: {}, sinceIso: daysAgoIso(historyDays), historyDays,
    keyOf: makeKeyFinder(DEFAULT_KEY_PATTERN), secret: async () => process.env.WHOSE_TURN_ADAPTER_TOKEN || '',
  });
} catch (error) {
  fail(1, ['poll failed:', ...problemsOf(error)]);
}

const source = 'check';
console.log(`poll ok · me ${JSON.stringify(result.me)} · ${KINDS.filter((kind) => result[kind]).map((kind) => `${result[kind].length} ${kind}`).join(', ')}`);
for (const [part, message] of Object.entries(result.errors)) {
  console.log(`  partial error ${part}: ${message}`);
}
const rows = turnRows(stamp(result, source), { me: { [source]: result.me }, rules: compileRules(DEFAULT_RULES), historyDays });
console.log(`default rules make ${rows.length} rows:`);
for (const row of rows.slice(0, 20)) {
  console.log(`  ${row.group.padEnd(6)} ${row.key} · ${row.next}`);
}
