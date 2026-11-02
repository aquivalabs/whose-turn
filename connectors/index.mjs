/** The connector registry: every source type the server knows, and the catalogue the settings form and Claude read. */
import * as github from './github.mjs';
import * as jira from './jira.mjs';

export const CONNECTORS = { github, jira };

export const connectorCatalogue = () => Object.values(CONNECTORS).map((connector) => ({ type: connector.id, label: connector.label, fields: connector.fields }));

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
