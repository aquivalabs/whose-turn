/** The connector registry: every source type the server knows, and the catalogue the settings form and Claude read. */
import * as github from './github.mjs';
import * as jira from './jira.mjs';
import * as linear from './linear.mjs';

export const CONNECTORS = { github, jira, linear };

/** What a workspace calls each of its connectors: the entry's own label, else its id when another entry has the same type, else the type's label (RMA-167). */
export const connectorSummaries = (entries) => entries.map((entry) => {
  const shared = entries.some((other) => other !== entry && other.type === entry.type);
  return { id: entry.id, type: entry.type, label: entry.label || (shared ? entry.id : CONNECTORS[entry.type]?.label || entry.type) };
});

export const connectorCatalogue = () => Object.values(CONNECTORS).map((connector) => ({ type: connector.id, label: connector.label, fields: connector.fields }));

/** The triples a stored secret is bound to: every secret field's service and account plus the connector's endpoint. */
const secretBindings = (entry) => (CONNECTORS[entry.type]?.fields || []).filter((field) => field.secret).map((field) => {
  const target = secretTarget(entry, field.key);
  return target ? { key: field.key, service: target.service, account: target.account, endpoint: String(entry[CONNECTORS[entry.type].endpointKey] || '') } : null;
}).filter(Boolean);

/** Secret fields of `entry` that must come with a fresh token because their service, account and endpoint triple is not already in the current config. */
export const secretsRequired = (currentEntries, entry) => {
  const known = new Set(currentEntries.flatMap(secretBindings).map((binding) => `${binding.service}\n${binding.account}\n${binding.endpoint}`));
  return secretBindings(entry).filter((binding) => !known.has(`${binding.service}\n${binding.account}\n${binding.endpoint}`)).map((binding) => binding.key);
};

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
