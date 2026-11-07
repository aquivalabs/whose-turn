/** Self-update of an installed package: a dist-tags check every ten minutes, one desktop notification per new version, and the one-click install and restart behind POST /api/update. ADR 0007, RMA-231. */
import { execFile, spawn as spawnChild } from 'node:child_process';
import { accessSync, constants, openSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { ApiError } from './errors.mjs';
import { readJson, writeJson } from './store.mjs';

const PACKAGE = 'whose-turn';
const AGENT_LABEL = 'local.whose-turn';
const UPDATE_CHECK_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const PLUGIN = 'whose-turn@bladeforge';
const PLUGIN_TIMEOUT_MS = 60 * 1000;
/** A plain semver version, pre-release allowed. */
export const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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

/** The version the install is pinned to, or '': an exact version recorded in `<dataDir>/app/package.json` (what npm writes for `--save-exact`), else `WHOSE_TURN_APP_VERSION` in the server's environment. ADR 0007, RMA-330. */
export const pinnedVersion = (dataDir, env = process.env) => {
  const recorded = readJson(join(dataDir, 'app', 'package.json'), {})?.dependencies?.[PACKAGE];
  return [recorded, env.WHOSE_TURN_APP_VERSION].find((spec) => typeof spec === 'string' && VERSION.test(spec)) ?? '';
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

// docs/adr/0007-release-pipeline.md
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

// docs/adr/0007-release-pipeline.md, RMA-341, RMA-424
/** What the user pastes into an open Claude session to load an updated plugin; the chip copies it in every state. */
export const RELOAD_PLUGINS = '/reload-plugins --force';

const isExecutable = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** The `claude` executable: the first hit on PATH's absolute entries, else the usual install locations a launch agent's PATH lacks; '' when none is executable. ADR 0007, RMA-416. */
export const findClaude = ({ env = process.env, home = homedir(), platform = process.platform, executable = isExecutable } = {}) => {
  const name = platform === 'win32' ? 'claude.exe' : 'claude';
  const usual = [join(home, '.claude', 'local'), join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const dirs = [...String(env.PATH || '').split(delimiter).filter((dir) => isAbsolute(dir)), ...usual];
  return dirs.map((dir) => join(dir, name)).find(executable) || '';
};

// docs/adr/0007-release-pipeline.md, RMA-341
const runClaude = (claude) => new Promise((resolve) => {
  execFile(claude, ['plugin', 'update', PLUGIN], { timeout: PLUGIN_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error) => resolve(error ? String(error.message).slice(0, 200) : ''));
});

/** Updates the Claude plugin and answers updated, manual (no `claude` found) or failed. */
export const updatePlugin = async ({ find = findClaude, run = runClaude } = {}) => {
  const claude = find();
  if (!claude) {
    return 'manual';
  }
  return (await run(claude)) ? 'failed' : 'updated';
};

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

/** Stops the server for good, unloading its own launchd agent first; README.md § API, POST /api/quit. RMA-356. */
export const quitServer = ({ agent = () => probeAgent(), platform = process.platform, uid = process.getuid?.(), spawn = spawnChild, exit = process.exit } = {}) => {
  if (agent() && platform === 'darwin') {
    spawn('launchctl', ['bootout', `gui/${uid}/${AGENT_LABEL}`], { detached: true, stdio: 'ignore' }).unref();
  }
  return exit(0);
};

/** Negative, zero or positive as version `first` is older than, equal to or newer than `second`; a release outranks its prereleases. */
export const compareVersions = (first, second) => {
  const parse = (value) => {
    const [core, pre = ''] = String(value).split('-');
    return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] };
  };
  const one = parse(first);
  const two = parse(second);
  for (let index = 0; index < 3; index += 1) {
    if (one.core[index] !== two.core[index]) {
      return one.core[index] - two.core[index];
    }
  }
  if (!one.pre.length || !two.pre.length) {
    return two.pre.length - one.pre.length;
  }
  for (let index = 0; index < Math.max(one.pre.length, two.pre.length); index += 1) {
    const [left, right] = [one.pre[index], two.pre[index]];
    if (left === undefined || right === undefined) {
      return left === undefined ? -1 : 1;
    }
    if (left !== right) {
      const numeric = /^\d+$/.test(left) && /^\d+$/.test(right);
      return numeric ? Number(left) - Number(right) : left < right ? -1 : 1;
    }
  }
  return 0;
};

/** The updater the API reads and writes; `installed` false (a checkout) keeps it idle and offers nothing, and so does a `pinned` version. */
export const createUpdater = ({ http, dataDir, version, installed, pinned = '', notify, registry = 'https://registry.npmjs.org', npm = 'npm', run = runNpm, plugin = updatePlugin, restart }) => {
  const listeners = new Set();
  const memoFile = join(dataDir, 'update.json');
  let latest = '';
  let pluginSeen = '';
  let pluginKnows = '';
  let state = 'idle';
  let reason = '';
  let memo = readJson(memoFile, {});
  const remember = (patch) => {
    memo = { ...memo, ...patch };
    writeJson(memoFile, memo);
  };

  const offerable = (found) => installed && !pinned && Boolean(found) && found !== version;
  const behind = () => VERSION.test(pluginKnows) && compareVersions(pluginKnows, version) < 0 && memo.pluginBehindCopied !== version;
  const pluginStatus = () => {
    const { for: target, state: pluginState, copied } = memo.plugin || {};
    if (target === version && !copied) {
      return { plugin: { state: pluginState, copy: RELOAD_PLUGINS } };
    }
    // README § API, update.plugin (RMA-350)
    return behind() ? { plugin: { state: 'behind', copy: RELOAD_PLUGINS, seen: pluginSeen, knows: pluginKnows } } : {};
  };
  const status = () => ({ current: version, latest, available: offerable(latest), state, ...(pinned ? { pinned } : {}), ...pluginStatus(), ...(state === 'failed' ? { reason } : {}) });
  const announce = () => listeners.forEach((listener) => listener({ update: status() }));
  const move = (next, why = '') => {
    state = next;
    reason = why;
    announce();
  };

  /** The plugin's own version and the monitor version its skill knows, from a request's X-Whose-Turn-Plugin and -Plugin-Knows headers. */
  const sawPlugin = (seen, knows = '') => {
    const next = [VERSION.test(seen) ? seen : '', VERSION.test(knows) ? knows : ''];
    if (next[0] !== pluginSeen || next[1] !== pluginKnows) {
      [pluginSeen, pluginKnows] = next;
      announce();
    }
  };

  const check = async () => {
    if (!installed) {
      return status();
    }
    const found = await http.fetchJson(`${registry}/-/package/${PACKAGE}/dist-tags`).then((tags) => tags && tags[CHANNEL], () => '');
    if (typeof found === 'string' && VERSION.test(found) && found !== latest) {
      latest = found;
      announce();
      if (offerable(found) && memo.notified !== found) {
        remember({ notified: found });
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
    remember({ plugin: { for: latest, state: await plugin().catch(() => 'failed') } });
    move('restarting');
    await restart();
  };

  /** The user copied the plugin chip's text: the chip is done for this version, in every window and for Claude. */
  const pluginCopied = () => {
    if (memo.plugin?.for === version && !memo.plugin.copied) {
      remember({ plugin: { ...memo.plugin, copied: true } });
      announce();
    } else if (behind()) {
      remember({ pluginBehindCopied: version });
      announce();
    }
    return status();
  };

  const apply = () => {
    if (state === 'installing' || state === 'restarting') {
      throw new ApiError('UPDATE_IN_PROGRESS', { state });
    }
    if (pinned) {
      throw new ApiError('PINNED', { pinned });
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

  return { status, check, apply, pluginCopied, sawPlugin, pluginSeen: () => pluginSeen, start, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
};

/** An updater for a server with nothing to update, the API's default. */
export const noUpdates = () => createUpdater({ http: null, dataDir: '', version: '', installed: false, notify: () => {}, restart: async () => {} });
