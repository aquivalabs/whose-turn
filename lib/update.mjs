/** Self-update of an installed package: a dist-tags check every ten minutes, one desktop notification per new version, and the one-click install and restart behind POST /api/update. ADR 0007, RMA-231. */
import { execFile, spawn as spawnChild } from 'node:child_process';
import { openSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from './errors.mjs';
import { readJson, writeJson } from './store.mjs';

const PACKAGE = 'whose-turn';
const AGENT_LABEL = 'local.whose-turn';
const UPDATE_CHECK_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Where the BladeForge plugin installs the package: `<dataDir>/app/node_modules/whose-turn`. */
export const installedRoot = (dataDir) => join(dataDir, 'app', 'node_modules', PACKAGE);

/** True when the server runs from the plugin's install, so an update has somewhere to land; a checkout is never offered one. */
export const runsInstalled = (appDir, dataDir, real = realpathSync) => {
  try {
    return real(appDir) === real(installedRoot(dataDir));
  } catch {
    return false;
  }
};

/** The dist-tag every install follows: `latest`, which the release workflow moves on every publish, prereleases included (RMA-230). */
export const CHANNEL = 'latest';

/** The launch agent this process runs under, as the exit code that brings it back, or null when it runs on its own: exit code 0 under launchd, 75 under systemd. README.md § Platforms. */
export const probeAgent = ({ platform = process.platform, env = process.env, cgroup = () => readFileSync('/proc/self/cgroup', 'utf8') } = {}) => {
  if (platform === 'darwin') {
    return env.XPC_SERVICE_NAME === AGENT_LABEL ? { exitCode: 0 } : null;
  }
  if (platform === 'linux') {
    try {
      return cgroup().includes(`/${PACKAGE}.service`) ? { exitCode: 75 } : null;
    } catch {
      return null;
    }
  }
  return null;
};

/** Runs npm and resolves with '' when it succeeded, else with the last lines it printed; on Windows npm is a .cmd, which needs a shell, so every argument is quoted. */
const runNpm = (npm, args, platform = process.platform) => new Promise((resolve) => {
  const shell = platform === 'win32';
  execFile(npm, shell ? args.map((arg) => `"${arg}"`) : args, { timeout: INSTALL_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, shell }, (error, stdout, stderr) => {
    if (!error) {
      return resolve('');
    }
    const lines = String(stderr || stdout || error.message).split('\n').map((line) => line.trim()).filter(Boolean);
    resolve(lines.slice(-3).join(' ').slice(0, 400) || 'npm failed');
  });
});

/** The restart after an install: under a launch agent exit and let it bring the new copy back; without one close the port, start the new copy detached and exit. */
export const restartServer = ({ server, root, dataDir, agent = () => probeAgent(), spawn = spawnChild, exit = process.exit }) => {
  const found = agent();
  if (found) {
    return exit(found.exitCode);
  }
  return new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }).then(() => {
    const log = openSync(join(dataDir, 'server.log'), 'a');
    spawn(process.execPath, [join(root, 'server.mjs')], { cwd: root, env: process.env, detached: true, stdio: ['ignore', log, log] }).unref();
    exit(0);
  });
};

/** The updater the API reads and writes; `installed` false (a checkout) keeps it idle and offers nothing. */
export const createUpdater = ({ http, dataDir, version, installed, notify, registry = 'https://registry.npmjs.org', npm = 'npm', run = runNpm, restart }) => {
  const listeners = new Set();
  const memoFile = join(dataDir, 'update.json');
  let latest = '';
  let state = 'idle';
  let reason = '';

  const status = () => ({ current: version, latest, available: installed && Boolean(latest) && latest !== version, state, ...(state === 'failed' ? { reason } : {}) });
  const announce = () => listeners.forEach((listener) => listener({ update: status() }));
  const move = (next, why = '') => {
    state = next;
    reason = why;
    announce();
  };

  const check = async () => {
    if (!installed) {
      return status();
    }
    const found = await http.fetchJson(`${registry}/-/package/${PACKAGE}/dist-tags`).then((tags) => tags && tags[CHANNEL], () => '');
    if (typeof found === 'string' && VERSION.test(found) && found !== latest) {
      latest = found;
      announce();
      if (found !== version && readJson(memoFile, {}).notified !== found) {
        writeJson(memoFile, { notified: found });
        notify(`Whose Turn ${found} is out`, 'Update from the window.');
      }
    }
    return status();
  };

  const install = async () => {
    const failure = await run(npm, ['install', '--prefix', join(dataDir, 'app'), '--no-audit', '--no-fund', '--no-save', '--ignore-scripts', `${PACKAGE}@${latest}`]);
    if (failure) {
      return move('failed', failure);
    }
    move('restarting');
    await restart();
  };

  const apply = () => {
    if (state === 'installing' || state === 'restarting') {
      throw new ApiError('UPDATE_IN_PROGRESS', { state });
    }
    if (!status().available) {
      throw new ApiError('UPDATE_UNAVAILABLE', { current: version, latest });
    }
    move('installing');
    install().catch((error) => move('failed', String(error?.message || error)));
    return status();
  };

  const start = () => {
    check();
    setInterval(check, UPDATE_CHECK_MS).unref();
  };

  return { status, check, apply, start, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
};

/** An updater for a server with nothing to update, the API's default. */
export const noUpdates = () => createUpdater({ http: null, dataDir: '', version: '', installed: false, notify: () => {}, restart: async () => {} });
