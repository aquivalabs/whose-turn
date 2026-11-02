#!/usr/bin/env node
/** Whose Turn server: loads the workspace config, polls every workspace's connectors on one loop with rate-limit backoff, serves the window and the local API. Node 22, no dependencies. */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { createHttpClient } from './lib/http-client.mjs';
import { createSecrets } from './lib/secrets.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { startApi } from './lib/api.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const http = createHttpClient();
const secrets = createSecrets(config.dataDir);
const workspaces = config.workspaces.map((definition) => createWorkspace(definition, { dataDir: config.dataDir, historyDays: config.historyDays, http, secrets }));

let wake = null;
const requestPoll = () => wake?.();

const sleep = (seconds) => new Promise((resolve) => {
  const timer = setTimeout(resolve, seconds * 1000);
  wake = () => { clearTimeout(timer); resolve(); };
});

const pollLoop = async () => {
  let delay = config.pollSeconds;
  for (;;) {
    const outcomes = await Promise.all(workspaces.map((workspace) => workspace.poll()));
    delay = outcomes.some((outcome) => outcome.rateLimited) ? Math.min(delay * 2, 15 * 60) : config.pollSeconds;
    await sleep(delay);
  }
};

await startApi({ port: config.port, appDir, workspaces, problems: config.problems, requestPoll });
console.log(`whose-turn on http://127.0.0.1:${config.port} · data ${config.dataDir} · workspaces ${workspaces.map((workspace) => workspace.id).join(', ') || 'none'}`);
for (const problem of config.problems) {
  console.error(problem);
}
pollLoop();
