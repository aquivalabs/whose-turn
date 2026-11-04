/** Secret store: the platform's own (Keychain, libsecret, Credential Manager) by service and account, else a 600-mode file <data>/secrets/<service>@<account>. */
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CREDENTIAL_SCRIPT = fileURLToPath(new URL('./platform/credential.ps1', import.meta.url));
const POWERSHELL = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', CREDENTIAL_SCRIPT];

export const LINE_BREAK = /[\r\n]/;

const quote = (text) => `"${text.replace(/[\\"]/g, '\\$&')}"`;

const STORES = {
  darwin: {
    get: (service, account) => ['security', ['find-generic-password', '-s', service, '-a', account, '-w']],
    set: (service, account, value) => ['security', ['-i'], `add-generic-password -U -a ${quote(account)} -s ${quote(service)} -w ${quote(value)}\n`],
  },
  linux: {
    get: (service, account) => ['secret-tool', ['lookup', 'service', service, 'account', account]],
    set: (service, account, value) => ['secret-tool', ['store', `--label=whose-turn ${service}`, 'service', service, 'account', account], value],
  },
  win32: {
    get: (service, account) => ['powershell', [...POWERSHELL, 'get', service, account]],
    set: (service, account, value) => ['powershell', [...POWERSHELL, 'set', service, account], value],
  },
};

const execute = (file, args, input = '') =>
  new Promise((resolve, reject) => {
    const child = execFile(file, args, (error, stdout) => (error ? reject(error) : resolve(stdout)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });

const fileName = (service, account) => `${service}@${account}`.replace(/[^\w.@-]+/g, '_');

const fromFile = async (dataDir, service, account) => {
  try {
    return (await readFile(join(dataDir, 'secrets', fileName(service, account)), 'utf8')).trim();
  } catch {
    return '';
  }
};

const toFile = async (dataDir, service, account, value) => {
  await mkdir(join(dataDir, 'secrets'), { recursive: true, mode: 0o700 });
  await writeFile(join(dataDir, 'secrets', fileName(service, account)), value, { mode: 0o600 });
};

export const createSecrets = (dataDir, { platform = process.platform, run = execute } = {}) => {
  const store = STORES[platform];
  const attempt = async (command) => {
    try {
      return await run(...command);
    } catch {
      return null;
    }
  };
  return {
    get: async (service, account) => {
      const stdout = store ? await attempt(store.get(service, account)) : null;
      return (stdout || '').trim() || (await fromFile(dataDir, service, account));
    },
    set: async (service, account, value) => {
      for (const [field, text] of Object.entries({ service, account, value })) {
        if (LINE_BREAK.test(text)) {
          throw new Error(`The secret ${field} must not contain a line break.`);
        }
      }
      if (store && (await attempt(store.set(service, account, value))) !== null) {
        return;
      }
      await toFile(dataDir, service, account, value);
    },
  };
};
