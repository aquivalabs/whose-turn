/** Shared by the plugin's scripts: where the monitor listens, a safe one-line text, and a short-timeout JSON fetch. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaultDataDir, resolvePort } from '../lib/config.mjs';

export const dataDir = () => process.env.WHOSE_TURN_DATA || defaultDataDir();

export const port = resolvePort(dataDir());
export const base = `http://127.0.0.1:${port}`;

export const inboxHasItems = () => existsSync(join(dataDir(), 'inbox.pending'));

// eslint-disable-next-line no-control-regex
export const flat = (text, limit = 200) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, limit);

/** The endpoint body, JSON of any shape. @returns {Promise<any>} */
export const getJson = async (path, timeoutMs = 3000) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return response.json();
};

/** The endpoint body, JSON of any shape. @returns {Promise<any>} */
export const postJson = async (path, body, timeoutMs = 10000) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return response.json();
};
