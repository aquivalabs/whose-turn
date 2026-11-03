/** User adapter connector: loads an adapter module from a path in the workspace config, checks it against the connector contract, and polls it like any built-in. The module runs inside the server with its rights. See docs/mechanisms/connector-contract.md. */
import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { adapterProblems, resultProblems, ContractError, KINDS } from '../lib/contract.mjs';
import { cachedToken } from '../lib/token-cache.mjs';
import { expandHome } from '../lib/text.mjs';

const DEFAULT_SERVICE = 'whose-turn-adapter';

export const id = 'module';
export const label = 'Your adapter';
export const experimental = true;
export const endpointKey = 'path';
export const links = () => [];
export const fields = [
  { key: 'path', label: 'Adapter file', hint: 'an .mjs module that follows the connector contract; ~ is your home directory', required: true },
  { key: 'token', label: 'Token', hint: 'optional; stored in the secret store under the adapter path, handed to the adapter as secret()', secret: { account: 'path', service: 'token_service', default: DEFAULT_SERVICE } },
  { key: 'token_service', label: 'Secret entry', hint: 'name of the secret-store entry; default whose-turn-adapter' },
];

const loaded = new Map();

/** The adapter at `path`, imported again when the file changes, checked against the contract; a module that is not a connector throws ContractError. */
export const loadAdapter = async (path) => {
  const file = expandHome(path);
  const { mtimeMs } = await stat(file).catch(() => {
    throw new Error(`No adapter file at ${path}`);
  });
  const known = loaded.get(file);
  if (known && known.mtimeMs === mtimeMs) {
    return known.adapter;
  }
  const adapter = await import(`${pathToFileURL(file).href}?v=${mtimeMs}`);
  const problems = adapterProblems(adapter);
  if (problems.length) {
    throw new ContractError(`Adapter ${path}`, problems);
  }
  loaded.set(file, { mtimeMs, adapter });
  return adapter;
};

/** The adapter's own required fields that the connector entry leaves empty. */
const missingFields = (adapter, settings) => adapter.fields.filter((field) => field.required && !field.secret && !String(settings[field.key] ?? '').trim()).map((field) => field.key);

/** One poll of an adapter, its result checked and cut to the kinds it declared; shared by this connector and scripts/check-adapter.mjs. */
export const pollAdapter = async (adapter, context) => {
  const missing = missingFields(adapter, context.settings);
  if (missing.length) {
    throw new Error(`Adapter ${adapter.id} needs ${missing.join(', ')} in the connector entry`);
  }
  const result = await adapter.poll(context);
  const problems = resultProblems(result, adapter.capabilities);
  if (problems.length) {
    throw new ContractError(`Adapter ${adapter.id}`, problems);
  }
  const data = Object.fromEntries(KINDS.filter((kind) => adapter.capabilities.includes(kind)).map((kind) => [kind, result[kind] || []]));
  return { me: result.me || '', ...data, ticket_base: typeof result.ticket_base === 'string' ? result.ticket_base : '', errors: result.errors || {} };
};

export const poll = async ({ settings, http, secrets, cache, sinceIso, historyDays, keyOf }) => {
  const adapter = await loadAdapter(settings.path);
  const service = settings.token_service || DEFAULT_SERVICE;
  const secret = () => cachedToken(cache, () => secrets.get(service, String(settings.path)));
  cache.adapter = cache.adapter || {};
  return pollAdapter(adapter, { settings, http, cache: cache.adapter, sinceIso, historyDays, keyOf, secret });
};
