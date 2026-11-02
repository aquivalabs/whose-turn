#!/usr/bin/env node
/** Whose Turn server: loads the workspace config, polls every workspace's connectors on one loop with rate-limit backoff, serves the window and the local API, reloads workspaces when the config is saved. Node 22, no dependencies. */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveWorkspaces } from './lib/config.mjs';
import { createHttpClient } from './lib/http-client.mjs';
import { createSecrets } from './lib/secrets.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { createRegistry } from './lib/registry.mjs';
import { openInbox } from './lib/inbox.mjs';
import { startApi } from './lib/api.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const http = createHttpClient();
const first = loadConfig();
const secrets = createSecrets(first.dataDir);
const inbox = openInbox(first.dataDir);
let pollSeconds = first.pollSeconds;

const registry = createRegistry({
  load: () => {
    const config = loadConfig();
    pollSeconds = config.pollSeconds;
    return config;
  },
  save: (rawWorkspaces) => saveWorkspaces(first.configFile, rawWorkspaces),
  build: (definition, config) => createWorkspace(definition, { dataDir: config.dataDir, historyDays: config.historyDays, http, secrets }),
});

let wake = null;
const requestPoll = () => wake?.();
const sleep = (seconds) => new Promise((resolve) => {
  const timer = setTimeout(resolve, seconds * 1000);
  wake = () => { clearTimeout(timer); resolve(); };
});

const pollLoop = async () => {
  let delay = pollSeconds;
  for (;;) {
    const outcomes = await Promise.all(registry.workspaces.map((workspace) => workspace.poll()));
    delay = outcomes.some((outcome) => outcome.rateLimited) ? Math.min(delay * 2, 15 * 60) : pollSeconds;
    await sleep(delay);
  }
};

const saveConfig = async (rawWorkspaces) => {
  const created = await registry.save(rawWorkspaces);
  await Promise.all(created.map((workspace) => workspace.poll()));
};

await startApi({ port: first.port, appDir, registry, requestPoll, saveConfig, secrets, inbox, http });
console.log(`whose-turn on http://127.0.0.1:${first.port} · data ${first.dataDir} · workspaces ${registry.workspaces.map((workspace) => workspace.id).join(', ') || 'none'}`);
for (const problem of registry.problems) {
  console.error(problem);
}
pollLoop();
