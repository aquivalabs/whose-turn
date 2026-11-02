#!/usr/bin/env node
/** Whose Turn server: loads the workspace config, polls every workspace's connectors on one loop with rate-limit backoff, serves the window and the local API, reloads workspaces when the config is saved. Node 22, no dependencies. */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveWorkspaces } from './lib/config.mjs';
import { createHttpClient } from './lib/http-client.mjs';
import { createSecrets } from './lib/secrets.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { startApi } from './lib/api.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const http = createHttpClient();
const listeners = new Set();
const registry = {
  workspaces: [], rawWorkspaces: [], problems: [], configFile: '',
  subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
};
let config = loadConfig();
const secrets = createSecrets(config.dataDir);

const applyConfig = () => {
  const previous = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace]));
  registry.workspaces = config.workspaces.map((definition) => {
    const existing = previous.get(definition.id);
    const unchanged = existing && JSON.stringify(existing.definition) === JSON.stringify(definition);
    const workspace = unchanged ? existing : createWorkspace(definition, { dataDir: config.dataDir, historyDays: config.historyDays, http, secrets });
    if (!unchanged) {
      workspace.subscribe((event) => listeners.forEach((listener) => listener(event)));
    }
    return workspace;
  });
  registry.rawWorkspaces = config.rawWorkspaces;
  registry.problems = config.problems;
  registry.configFile = config.configFile;
};

let wake = null;
const requestPoll = () => wake?.();

const saveConfig = async (rawWorkspaces) => {
  saveWorkspaces(config.configFile, rawWorkspaces);
  config = loadConfig();
  applyConfig();
  requestPoll();
};

const sleep = (seconds) => new Promise((resolve) => {
  const timer = setTimeout(resolve, seconds * 1000);
  wake = () => { clearTimeout(timer); resolve(); };
});

const pollLoop = async () => {
  let delay = config.pollSeconds;
  for (;;) {
    const outcomes = await Promise.all(registry.workspaces.map((workspace) => workspace.poll()));
    delay = outcomes.some((outcome) => outcome.rateLimited) ? Math.min(delay * 2, 15 * 60) : config.pollSeconds;
    await sleep(delay);
  }
};

applyConfig();
await startApi({ port: config.port, appDir, registry, requestPoll, saveConfig, secrets });
console.log(`whose-turn on http://127.0.0.1:${config.port} · data ${config.dataDir} · workspaces ${registry.workspaces.map((workspace) => workspace.id).join(', ') || 'none'}`);
for (const problem of config.problems) {
  console.error(problem);
}
pollLoop();
