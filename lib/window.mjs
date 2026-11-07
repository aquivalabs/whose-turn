/** The app window's remembered size in <data>/window.json, and the launcher behind the window's "Open as app" button. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ApiError } from './errors.mjs';
import { readJson, writeJson } from './store.mjs';
import { intInRange } from './text.mjs';

const MODES = ['app', 'browser'];
const inRange = (value) => intInRange(value, 300, 10000);

export const readSize = (dataDir) => {
  const { width, height } = readJson(join(dataDir, 'window.json'), {});
  return inRange(width) && inRange(height) ? { width, height } : {};
};

export const saveSize = (dataDir, { width, height }) => {
  if (!inRange(width) || !inRange(height)) {
    throw new ApiError('INVALID_ARGUMENT', { detail: 'width and height are whole pixels between 300 and 10000' });
  }
  writeJson(join(dataDir, 'window.json'), { width, height });
  return { width, height };
};

export const checkMode = (mode) => {
  if (!MODES.includes(mode)) {
    throw new ApiError('INVALID_ARGUMENT', { detail: `mode is one of ${MODES.join(', ')}` });
  }
  return mode;
};

export const spawnOpener = (appDir) => ({ mode, port }) => {
  const args = mode === 'browser' ? ['--browser'] : [];
  spawn(join(appDir, 'open.sh'), args, { env: { ...process.env, WHOSE_TURN_PORT: String(port) }, detached: true, stdio: 'ignore' }).unref();
};
