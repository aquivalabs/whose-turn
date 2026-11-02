/** Secret store: the macOS Keychain by service and account, else a 600-mode file <data>/secrets/<service>@<account>. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const fileName = (service, account) => `${service}@${account}`.replace(/[^\w.@-]+/g, '_');

const fromFile = async (dataDir, service, account) => {
  try {
    return (await readFile(join(dataDir, 'secrets', fileName(service, account)), 'utf8')).trim();
  } catch {
    return '';
  }
};

const toKeychain = async (service, account, value) => {
  if (process.platform !== 'darwin') {
    return false;
  }
  try {
    await run('security', ['add-generic-password', '-U', '-a', account, '-s', service, '-w', value]);
    return true;
  } catch {
    return false;
  }
};

const toFile = async (dataDir, service, account, value) => {
  await mkdir(join(dataDir, 'secrets'), { recursive: true, mode: 0o700 });
  await writeFile(join(dataDir, 'secrets', fileName(service, account)), value, { mode: 0o600 });
};

export const createSecrets = (dataDir) => ({
  get: async (service, account) => (await fromKeychain(service, account)) || (await fromFile(dataDir, service, account)),
  set: async (service, account, value) => {
    if (!(await toKeychain(service, account, value))) {
      await toFile(dataDir, service, account, value);
    }
  },
});
