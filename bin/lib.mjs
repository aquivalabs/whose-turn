/** Shared by the plugin's scripts: where the monitor listens, a safe one-line text, and a short-timeout JSON fetch. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const port = process.env.WHOSE_TURN_PORT || '8765';
export const base = `http://127.0.0.1:${port}`;

export const dataDir = () => {
  if (process.env.WHOSE_TURN_DATA) {
    return process.env.WHOSE_TURN_DATA;
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'whose-turn');
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'whose-turn');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'whose-turn');
};

export const inboxHasItems = () => existsSync(join(dataDir(), 'inbox.pending'));

export const flat = (text, limit = 200) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, limit);

export const getJson = async (path, timeoutMs = 3000) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return response.json();
};

export const postJson = async (path, body, timeoutMs = 10000) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return response.json();
};
