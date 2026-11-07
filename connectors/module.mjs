/** User adapter connector: loads the adapter the workspace config names from the adapters folder in the data directory, checks it against the connector contract, and polls it like any built-in. See docs/mechanisms/connector-contract.md. */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { adapterProblems, resultProblems, ContractError, KINDS } from '../lib/contract.mjs';
import { cachedToken } from '../lib/token-cache.mjs';
import { Adapter } from '../lib/adapter.mjs';
import { expandHome } from '../lib/text.mjs';

const DEFAULT_SERVICE = 'whose-turn-adapter';

export const id = 'module';
export const label = 'Custom';
export const endpointKey = 'adapter';
export const links = () => [];
export const fields = [
  { key: 'token', label: 'Token', hint: 'optional; stored in the secret store under the adapter name, handed to the adapter as secret()', secret: { account: 'adapter', service: 'token_service', default: DEFAULT_SERVICE } },
  { key: 'token_service', label: 'Secret entry', hint: 'name of the secret-store entry; default whose-turn-adapter' },
];

const loaded = new Map();
const SHIM = '_whose-turn.mjs';
const BASE_URL = new URL('../lib/adapter.mjs', import.meta.url);

/** The folder of user adapters in a data directory. */
export const adaptersDirOf = (dataDir) => join(dataDir, 'adapters');

/** Creates the adapters folder and writes `_whose-turn.mjs`, which re-exports this server's `Adapter` so an adapter's import always resolves. */
export const writeAdapterShim = async (adaptersDir) => {
  const text = `/** Written by Whose Turn at every start: the base class the adapters in this folder extend. */\nexport { Adapter } from '${BASE_URL.href}';\n`;
  const file = join(adaptersDir, SHIM);
  await mkdir(adaptersDir, { recursive: true });
  if (await readFile(file, 'utf8').catch(() => '') !== text) {
    await writeFile(file, text);
  }
  return file;
};
const ADAPTER_NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** The file of the adapter named `name` in `adaptersDir`; a name that is not a plain file name throws. */
export const adapterFile = (adaptersDir, name) => {
  if (typeof name !== 'string' || !ADAPTER_NAME.test(name)) {
    throw new Error(`Adapter name ${JSON.stringify(name)} must be lowercase letters, digits, - or _, the file name without .mjs`);
  }
  return join(adaptersDir, `${name}.mjs`);
};

/** The adapter a module exports as its default: an Adapter instance, or a new one of an Adapter subclass; null for anything else. */
const adapterOf = (exported) => {
  if (exported.default instanceof Adapter) {
    return exported.default;
  }
  return typeof exported.default === 'function' && exported.default.prototype instanceof Adapter ? new exported.default() : null;
};

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
  const adapter = adapterOf(await import(`${pathToFileURL(file).href}?v=${mtimeMs}`));
  if (!adapter) {
    throw new ContractError(`Adapter ${path}`, [`its default export must be a subclass of Adapter, imported from './${SHIM}'`]);
  }
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

export const poll = async ({ settings, http, secrets, cache, sinceIso, historyDays, keyOf, adaptersDir }) => {
  const adapter = await loadAdapter(adapterFile(adaptersDir, settings.adapter));
  const service = settings.token_service || DEFAULT_SERVICE;
  const secret = () => cachedToken(cache, () => secrets.get(service, String(settings.adapter)));
  cache.adapter = cache.adapter || {};
  return pollAdapter(adapter, { settings, http, cache: cache.adapter, sinceIso, historyDays, keyOf, secret });
};

/** The config violations of every `module` entry whose adapter in `dataDir`'s adapters folder is missing or breaks the contract, at the entry's `adapter` field. */
export const adapterViolations = async (rawWorkspaces, dataDir) => {
  const violations = [];
  for (const [index, workspace] of rawWorkspaces.entries()) {
    for (const [position, entry] of (Array.isArray(workspace?.connectors) ? workspace.connectors : []).entries()) {
      if (entry?.type !== 'module') {
        continue;
      }
      try {
        await loadAdapter(adapterFile(adaptersDirOf(dataDir), entry.adapter));
      } catch (error) {
        violations.push({ field: `workspaces[${index}].connectors[${position}].adapter`, description: `Workspace "${workspace.id}", connector "${entry.id}": ${error.message}` });
      }
    }
  }
  return violations;
};

const CYRILLIC = { '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g', '\u0434': 'd', '\u0435': 'e', '\u0451': 'e', '\u0436': 'zh', '\u0437': 'z', '\u0438': 'i', '\u0439': 'y', '\u043a': 'k', '\u043b': 'l', '\u043c': 'm', '\u043d': 'n', '\u043e': 'o', '\u043f': 'p', '\u0440': 'r', '\u0441': 's', '\u0442': 't', '\u0443': 'u', '\u0444': 'f', '\u0445': 'kh', '\u0446': 'ts', '\u0447': 'ch', '\u0448': 'sh', '\u0449': 'shch', '\u044a': '', '\u044b': 'y', '\u044c': '', '\u044d': 'e', '\u044e': 'yu', '\u044f': 'ya', '\u0456': 'i', '\u0457': 'yi', '\u0454': 'ye', '\u0491': 'g' };

/** The adapter file name made from a name the user typed: Latin, lowercase, words joined by `_`, at most 40 characters; '' when nothing is left. */
export const adapterNameOf = (name) => String(name || '')
  .toLowerCase()
  .replace(/[\u0080-\uffff]/g, (letter) => CYRILLIC[letter] ?? letter.normalize('NFD').replace(/[\u0080-\uffff]/g, ''))
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40)
  .replace(/_+$/, '');

const TEMPLATE = (name, label) => {
  const className = name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('').replace(/^(?=\d)/, 'Source');
  const adapterId = name.replace(/_/g, '-').replace(/^(?=[^a-z])/, 's');
  return `/** ${label.replace(/\*\//g, '')}: your own source for Whose Turn. Fill in poll(); the contract is docs/mechanisms/connector-contract.md in the whose-turn package. */
import { Adapter } from './${SHIM}';

export default class ${className} extends Adapter {
  contract = 1;
  id = '${adapterId}';
  label = ${JSON.stringify(label)};
  capabilities = ['tickets'];
  fields = [];

  async poll({ settings, http, secret }) {
    return { me: '', tickets: [] };
  }
}
`;
};

const moduleEntries = (rawWorkspaces) => rawWorkspaces.flatMap((workspace) => (Array.isArray(workspace?.connectors) ? workspace.connectors : []).filter((entry) => entry?.type === 'module' && typeof entry === 'object'));

/** Gives every `module` entry that has no adapter yet the name made from its label. */
export const nameAdapterEntries = (rawWorkspaces) => {
  for (const entry of moduleEntries(rawWorkspaces)) {
    if (!entry.adapter && adapterNameOf(entry.label)) {
      entry.adapter = adapterNameOf(entry.label);
    }
  }
};

/** Writes a template into the adapters folder for every `module` entry whose adapter has no file yet; returns the names it wrote. */
export const writeAdapterTemplates = async (rawWorkspaces, dataDir) => {
  const written = [];
  for (const entry of moduleEntries(rawWorkspaces)) {
    if (typeof entry.adapter !== 'string' || !ADAPTER_NAME.test(entry.adapter)) {
      continue;
    }
    const adaptersDir = adaptersDirOf(dataDir);
    const file = adapterFile(adaptersDir, entry.adapter);
    if (!(await stat(file).catch(() => null))) {
      await writeAdapterShim(adaptersDir);
      await writeFile(file, TEMPLATE(entry.adapter, String(entry.label || entry.adapter)), { flag: 'wx' });
      written.push(entry.adapter);
    }
  }
  return written;
};

/** What the settings sheet needs about each adapter in the folder: its label and fields, or the problem that stops it loading. */
export const adapterCatalogue = async (dataDir) => {
  const adaptersDir = adaptersDirOf(dataDir);
  const names = (await readdir(adaptersDir).catch(() => [])).filter((file) => file.endsWith('.mjs') && !file.startsWith('_')).map((file) => file.slice(0, -4)).filter((name) => ADAPTER_NAME.test(name));
  const entries = await Promise.all(names.map(async (name) => {
    try {
      const adapter = await loadAdapter(adapterFile(adaptersDir, name));
      return [name, { label: adapter.label, fields: adapter.fields }];
    } catch (error) {
      return [name, { problem: error.message }];
    }
  }));
  return Object.fromEntries(entries);
};
