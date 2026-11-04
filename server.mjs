#!/usr/bin/env node
/** Whose Turn server: loads the workspace config, polls every workspace on one loop with rate-limit backoff, checks data health on a timer, serves the window and the local API. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveWorkspaces, saveNotifications, saveSettings, normaliseWorkspaces } from './lib/config.mjs';
import { createHttpClient } from './lib/http-client.mjs';
import { nextDelay } from './lib/backoff.mjs';
import { createSecrets } from './lib/secrets.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { createRegistry } from './lib/registry.mjs';
import { openInbox } from './lib/inbox.mjs';
import { openReports, RELAY_URL, NEWS_EVERY_MS } from './lib/feedback.mjs';
import { startApi } from './lib/api.mjs';
import { notifier } from './lib/notify.mjs';
import { loadChangelog } from './lib/changelog.mjs';
import { createUpdater, restartServer, runsInstalled } from './lib/update.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const http = createHttpClient();
const first = loadConfig();
const secrets = createSecrets(first.dataDir);
const inbox = openInbox(first.dataDir);
const reports = openReports(first.dataDir, { http, relayUrl: process.env.WHOSE_TURN_FEEDBACK_URL || RELAY_URL, adminToken: () => secrets.get('whose-turn-feedback-admin', 'relay') });
const { version } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
let server;
const notify = notifier(() => process.env.WHOSE_TURN_NOTIFY !== 'off' && registry.notifications.desktop);
const updater = createUpdater({
  http,
  dataDir: first.dataDir,
  version,
  installed: runsInstalled(appDir, first.dataDir),
  notify,
  registry: process.env.WHOSE_TURN_REGISTRY,
  npm: process.env.WHOSE_TURN_NPM,
  restart: () => restartServer({ server, root: appDir, dataDir: first.dataDir }),
});
let pollSeconds = first.pollSeconds;
let historyDays = first.historyDays;
/** @type {{ stale_minutes: number, failing_polls: number }} */
let healthLimits = /** @type {any} */ (first.health);

const registry = createRegistry({
  load: () => {
    const config = loadConfig();
    pollSeconds = config.pollSeconds;
    historyDays = config.historyDays;
    healthLimits = /** @type {any} */ (config.health);
    return config;
  },
  save: (rawWorkspaces) => saveWorkspaces(first.configFile, rawWorkspaces),
  saveNotifications: (notifications) => saveNotifications(first.configFile, notifications),
  saveSettings: (settings) => saveSettings(first.configFile, settings),
  normalise: (rawWorkspaces) => normaliseWorkspaces(rawWorkspaces).workspaces,
  build: (definition, config) => createWorkspace(definition, { dataDir: config.dataDir, historyDays: () => historyDays, http, secrets, limits: () => healthLimits, notify, hidden: () => registry.hiddenOf(definition.id), unpark: (id) => registry.setHidden(id, '') }),
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
    const outcomes = await Promise.all(registry.workspaces.map((workspace) => workspace.pollIfDue()));
    delay = nextDelay(outcomes, delay, pollSeconds);
    await sleep(delay);
  }
};

const saveConfig = async (rawWorkspaces) => {
  const created = await registry.save(rawWorkspaces);
  await Promise.all(created.map((workspace) => workspace.pollIfDue()));
};

try {
  server = await startApi({ port: first.port, appDir, registry, requestPoll, saveConfig, secrets, inbox, http, reports, dataDir: first.dataDir, updater, changelog: loadChangelog(appDir, version), version });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`whose-turn ${version} on http://127.0.0.1:${first.port} · data ${first.dataDir} · workspaces ${registry.workspaces.map((workspace) => workspace.id).join(', ') || 'none'}`);
for (const problem of registry.problems) {
  console.error(problem);
}
pollLoop();
updater.start();
const FIRST_NEWS_MS = 30000;
const checkReports = () => reports.checkNews().catch(() => {});
setTimeout(checkReports, FIRST_NEWS_MS).unref();
setInterval(checkReports, NEWS_EVERY_MS).unref();

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
