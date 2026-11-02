import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
const server = readFileSync(new URL('../server.py', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('config.example.json names only placeholder accounts', () => {
  assert.equal(example.github.repo, 'your-org/your-repo');
  assert.equal(example.jira.email, 'you@example.com');
  assert.match(example.jira.base, /^https:\/\/your-site\./);
});

test('every key in config.example.json is read by the server and documented in the README', () => {
  for (const [section, value] of Object.entries(example)) {
    if (typeof value !== 'object') { assert.ok(server.includes(`"${section}"`), `server reads ${section}`); continue; }
    for (const key of Object.keys(value)) {
      assert.ok(server.includes(`"${key}"`), `server reads ${section}.${key}`);
      assert.ok(readme.includes(`${section}.${key}`) || readme.includes(`\`${key}\``), `README documents ${section}.${key}`);
    }
  }
});
