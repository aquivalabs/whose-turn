#!/usr/bin/env node
/** Whose Turn server: loads the workspace config, polls every workspace on one loop with rate-limit backoff, checks data health on a timer, serves the window and the local API. */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveWorkspaces, normaliseWorkspaces } from './lib/config.mjs';
import { createHttpClient } from './lib/http-client.mjs';
import { nextDelay } from './lib/backoff.mjs';
import { createSecrets } from './lib/secrets.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { createRegistry } from './lib/registry.mjs';
import { openInbox } from './lib/inbox.mjs';
import { openReports } from './lib/feedback.mjs';
import { startApi } from './lib/api.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const http = createHttpClient();
const first = loadConfig();
const secrets = createSecrets(first.dataDir);
const inbox = openInbox(first.dataDir);
const reports = openReports(first.dataDir);
let pollSeconds = first.pollSeconds;
/** @type {{ stale_minutes: number, failing_polls: number }} */
let healthLimits = /** @type {any} */ (first.health);

const registry = createRegistry({
  load: () => {
    const config = loadConfig();
    pollSeconds = config.pollSeconds;
    healthLimits = /** @type {any} */ (config.health);
    return config;
  },
  save: (rawWorkspaces) => saveWorkspaces(first.configFile, rawWorkspaces),
  normalise: (rawWorkspaces) => normaliseWorkspaces(rawWorkspaces).workspaces,
  build: (definition, config) => createWorkspace(definition, { dataDir: config.dataDir, historyDays: config.historyDays, http, secrets, limits: () => healthLimits }),
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
    delay = nextDelay(outcomes, delay, pollSeconds);
    await sleep(delay);
  }
};

const saveConfig = async (rawWorkspaces) => {
  const created = await registry.save(rawWorkspaces);
  await Promise.all(created.map((workspace) => workspace.poll()));
};

try {
  await startApi({ port: first.port, appDir, registry, requestPoll, saveConfig, secrets, inbox, http, reports, dataDir: first.dataDir });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`whose-turn on http://127.0.0.1:${first.port} · data ${first.dataDir} · workspaces ${registry.workspaces.map((workspace) => workspace.id).join(', ') || 'none'}`);
for (const problem of registry.problems) {
  console.error(problem);
}
pollLoop();

const HEALTH_TICK = 30000;
let lastTick = Date.now();
setInterval(() => {
  const slept = Date.now() - lastTick > 3 * HEALTH_TICK;
  lastTick = Date.now();
  if (slept) {
    requestPoll();
    return;
  }
  registry.workspaces.forEach((workspace) => workspace.checkHealth());
}, HEALTH_TICK).unref();
