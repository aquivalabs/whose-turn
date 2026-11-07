import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const packed = () => {
  // npm 10 prints an array of packages, npm 12 an object keyed by package name.
  const out = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const [{ files }] = Array.isArray(out) ? out : Object.values(out);
  return files.map((f) => f.path);
};

test('the published package carries the server and the window, and neither the plugin nor the workbench', () => {
  const paths = packed();
  const has = (prefix) => paths.some((p) => p === prefix || p.startsWith(`${prefix}/`));
  for (const required of ['server.mjs', 'lib', 'connectors', ...(existsSync(new URL('dist', root)) ? ['dist'] : []), 'install.sh', 'launch.sh', 'open.sh', 'config.example.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    assert.ok(has(required), `${required} is in the package`);
  }
  for (const absent of ['bin', 'hooks', 'commands', 'skills', '.claude-plugin', 'web', 'test', 'scripts', 'docs', '.users-files', '.github', '.githooks', '.claude', '.review', 'vite.config.mjs', 'vitest.config.ts', 'package-lock.json', 'AGENTS.md', 'CLAUDE.md']) {
    assert.ok(!has(absent), `${absent} stays out of the package`);
  }
});

test('package.json is publishable: public, with a files list', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('dist/'));
});

test('the published package carries no demo', () => {
  assert.deepEqual(packed().filter((path) => /demo/i.test(path)), []);
});
