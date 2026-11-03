import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const packed = () => {
  const [{ files }] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  return files.map((f) => f.path);
};

test('the published package carries the server, the plugin files and the window, and nothing of the workbench', () => {
  const paths = packed();
  const has = (prefix) => paths.some((p) => p === prefix || p.startsWith(`${prefix}/`));
  for (const required of ['server.mjs', 'lib', 'connectors', 'bin', 'hooks', 'commands', 'skills', '.claude-plugin/plugin.json', 'install.sh', 'open.sh', 'config.example.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    assert.ok(has(required), `${required} is in the package`);
  }
  for (const absent of ['web', 'test', 'scripts', 'docs', '.users-files', '.github', '.githooks', '.claude', '.review', 'vite.config.mjs', 'vitest.config.ts', 'package-lock.json', 'AGENTS.md', 'CLAUDE.md']) {
    assert.ok(!has(absent), `${absent} stays out of the package`);
  }
});

test('package.json is publishable: public, versioned like the plugin manifest, with a files list', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const plugin = JSON.parse(readFileSync(new URL('.claude-plugin/plugin.json', root), 'utf8'));
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('dist/'));
  assert.equal(pkg.version, plugin.version);
});
