/** Starts the monitor when it is down: the launch agent on macOS, the user unit on Linux, else a detached server.mjs. Platform, runner and probe are injectable. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base } from './lib.mjs';

const SERVER = join(dirname(dirname(fileURLToPath(import.meta.url))), 'server.mjs');
const LABEL = 'local.whose-turn';

const detachedServer = () => [process.execPath, [SERVER], { detached: true }];

// Each platform returns the argv steps to try in order; a step that fails hands over to the next.
const STARTS = {
  darwin: ({ home, uid, exists }) => {
    if (!exists(join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`))) {
      return [detachedServer()];
    }
    return [
      ['launchctl', ['kickstart', `gui/${uid}/${LABEL}`]],
      ['launchctl', ['bootstrap', `gui/${uid}`, join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`)]],
      detachedServer(),
    ];
  },
  linux: ({ home, exists }) => {
    if (!exists(join(home, '.config', 'systemd', 'user', 'whose-turn.service'))) {
      return [detachedServer()];
    }
    return [['systemctl', ['--user', 'start', 'whose-turn']], detachedServer()];
  },
  win32: () => [detachedServer()],
};

const execute = (file, args, { detached = false } = {}) => {
  if (detached) {
    spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  }
  return spawnSync(file, args, { stdio: 'ignore' }).status === 0;
};

const reachable = async () => {
  try {
    await fetch(`${base}/api/summary`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns true when the monitor answers, starting it first if it does not. */
export const ensureRunning = async ({
  platform = process.platform,
  run = execute,
  probe = reachable,
  exists = existsSync,
  home = homedir(),
  uid = process.getuid?.(),
  wait = pause,
  tries = 5,
} = {}) => {
  if (await probe()) {
    return true;
  }
  const steps = STARTS[platform]?.({ home, uid, exists }) || [detachedServer()];
  for (const [file, args, options] of steps) {
    if (!run(file, args, options)) {
      continue;
    }
    for (let attempt = 0; attempt < tries; attempt++) {
      await wait(1000);
      if (await probe()) {
        return true;
      }
    }
    return false;
  }
  return false;
};
