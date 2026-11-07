/** The connector registry: every source type the server knows, and the catalogue the settings form and Claude read. */
import github from './github.mjs';
import jira from './jira.mjs';
import linear from './linear.mjs';
import file from './file.mjs';
import * as module from './module.mjs';

export const CONNECTORS = { github, jira, linear, file, module };

/** What a workspace calls each of its connectors: the entry's own label, else its id when another entry has the same type, else the type's label (RMA-167); with the feed badge and icon tone its type declares (RMA-429). */
export const connectorSummaries = (entries) => entries.map((entry) => {
  const shared = entries.some((other) => other !== entry && other.type === entry.type);
  const connector = CONNECTORS[entry.type];
  const label = entry.label || (shared ? entry.id : connector?.label || entry.type);
  return { id: entry.id, type: entry.type, label, badge: connector?.badge && label === connector.label ? connector.badge : '', tone: connector?.tone ?? 'jira' };
});

/** The settings form lists the supported types; an experimental one (RMA-95) is accepted in the config but not offered. */
export const connectorCatalogue = () => Object.values(CONNECTORS).filter((connector) => !('experimental' in connector && connector.experimental)).map((connector) => ({ type: connector.id, label: connector.label, fields: connector.fields }));

// docs/adr/0014-config-api-trusts-local-processes.md
const secretBindings = (entry) => (CONNECTORS[entry.type]?.fields || []).filter((field) => field.secret).map((field) => {
  const target = secretTarget(entry, field.key);
  return target ? { key: field.key, service: target.service, account: target.account, endpoint: String(entry[CONNECTORS[entry.type].endpointKey] || '') } : null;
}).filter(Boolean);

/** Secret fields of `entry` that must come with a fresh token because their service, account and endpoint triple is not already in the current config. */
export const secretsRequired = (currentEntries, entry) => {
  const known = new Set(currentEntries.flatMap(secretBindings).map((binding) => `${binding.service}\n${binding.account}\n${binding.endpoint}`));
  const boundToEndpoint = (binding) => binding.account === binding.endpoint;
  return secretBindings(entry).filter((binding) => !boundToEndpoint(binding) && !known.has(`${binding.service}\n${binding.account}\n${binding.endpoint}`)).map((binding) => binding.key);
};

/** The distinct service and account pairs under which the entries' secrets are stored. */
export const secretStores = (entries) => [...new Map(entries.flatMap(secretBindings).map(({ service, account }) => [`${service}\n${account}`, { service, account }])).values()];

/** Resolves where a secret field of one connector entry is stored: the service and the account to file it under. */
export const secretTarget = (entry, key) => {
  const field = (CONNECTORS[entry.type]?.fields || []).find((candidate) => candidate.key === key && candidate.secret);
  if (!field) {
    return null;
  }
  const account = String(entry[field.secret.account] || '').trim();
  const service = String(entry[field.secret.service] || field.secret.default || '').trim();
  return account && service ? { service, account } : null;
};
