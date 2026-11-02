/** Secret lookup: the macOS Keychain by service and account, else a 600-mode file under <data>/secrets. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const run = promisify(execFile);

const fromKeychain = async (service, account) => {
  if (process.platform !== 'darwin') {
    return '';
  }
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', service, '-a', account, '-w']);
    return stdout.trim();
  } catch {
    return '';
  }
};

const fromFile = async (dataDir, service) => {
  try {
    return (await readFile(join(dataDir, 'secrets', service), 'utf8')).trim();
  } catch {
    return '';
  }
};

export const createSecrets = (dataDir) => ({
  get: async (service, account) => (await fromKeychain(service, account)) || (await fromFile(dataDir, service)),
});
