import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  configSanity,
  declaredDocsResolve,
  formatFinding,
  pairedDocs,
  resolveBase,
  runAll,
  sectionReadmes,
  slugifyHeading,
  structure,
  surfaceRules,
} from '../scripts/docs-check.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'docs-check.mjs');
const README = '# Section\n\n## Boundary\n\n## Shape\n\n## Update trigger\n\n## Exclusions\n\n## Acceptance criteria\n';
const ADR = '# ADR\n\n## Status\n\n## Context\n\n## Decision\n\n## Consequences\n';

const baseConfig = () => ({
  schemaVersion: '1',
  layers: {
    adr: { root: 'docs/adr/', index: 'README.md', requiredFields: ['Status', 'Context', 'Decision', 'Consequences'], numbered: true },
    mechanisms: 'docs/mechanisms/',
    frozen: 'docs/plans/',
  },
  mechanisms: [{ id: 'rules', paths: ['lib/*.mjs', '!lib/skip.mjs'], doc: 'docs/mechanisms/rules.md' }],
});

const makeRepo = (config = baseConfig(), files = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'wt-docs-'));
  const all = {
    '.claude/docs.config.json': JSON.stringify(config),
    '.claude/docs.config.schema.json': JSON.stringify({ version: '1' }),
    'docs/adr/README.md': `${README}\n| 0001 | [one](0001-one.md) |\n`,
    'docs/adr/0001-one.md': ADR,
    'docs/mechanisms/README.md': README,
    'docs/mechanisms/rules.md': '# Rules\n',
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};

const messages = (findings) => findings.map(({ job, message }) => `${job}: ${message}`);

test('a clean repository yields no findings', () => {
  const root = makeRepo();
  assert.deepEqual(runAll(baseConfig(), root, []), []);
});

test('config-sanity flags colliding layer roots', () => {
  const config = { ...baseConfig(), layers: { a: 'docs/', b: 'docs/adr/' } };
  assert.match(configSanity(config, makeRepo(config))[0].message, /layer roots collide: 'docs\/' and 'docs\/adr\/'/);
});

test('config-sanity flags a schema version mismatch and an absent version', () => {
  const root = makeRepo();
  assert.match(configSanity({ ...baseConfig(), schemaVersion: '0' }, root)[0].message, /seeded against 0, schema is now 1/);
  const { schemaVersion, ...unversioned } = baseConfig();
  assert.match(configSanity(unversioned, root)[0].message, /seeded against absent/);
});

test('config-sanity flags an empty mechanism list unless acknowledged', () => {
  const root = makeRepo();
  assert.deepEqual(messages(configSanity({ ...baseConfig(), mechanisms: [] }, root)), ['config-sanity: no mechanisms declared']);
  assert.deepEqual(configSanity({ ...baseConfig(), mechanisms: [], acknowledgedEmptyMechanisms: true }, root), []);
});

test('structure flags a missing layer root and a root outside the repository', () => {
  const root = makeRepo();
  assert.match(structure({ layers: { a: 'nowhere/' } }, root)[0].message, /does not exist/);
  assert.match(structure({ layers: { a: '../outside/' } }, root)[0].message, /outside the repository/);
});

test('structure flags a file the index does not link and a missing index', () => {
  const root = makeRepo(baseConfig(), { 'docs/adr/0002-two.md': ADR });
  assert.ok(messages(structure(baseConfig(), root)).includes('structure: file not linked from index docs/adr/README.md'));
  const noIndex = makeRepo(baseConfig(), {});
  const config = { layers: { adr: { root: 'docs/adr/', index: 'MISSING.md' } } };
  assert.match(structure(config, noIndex)[0].message, /declared index file is missing/);
});

test('structure flags a missing required field heading', () => {
  const root = makeRepo(baseConfig(), { 'docs/adr/0001-one.md': '# ADR\n\n## Status\n' });
  assert.deepEqual(
    messages(structure(baseConfig(), root)).filter((line) => line.includes('required field')),
    ['structure: missing required field heading: Context', 'structure: missing required field heading: Decision', 'structure: missing required field heading: Consequences'],
  );
});

test('structure flags numbered files without NNNN- and index rows without the number', () => {
  const root = makeRepo(baseConfig(), {
    'docs/adr/README.md': `${README}\n| x | [two](two.md) |\n`,
    'docs/adr/two.md': ADR,
  });
  const found = messages(structure(baseConfig(), root));
  assert.ok(found.includes('structure: numbered layer file name does not start with NNNN-'));
  assert.ok(found.includes('structure: index row for this numbered file does not carry the matching number 0001'));
});

test('structure flags a dead file link and a dead heading anchor', () => {
  const root = makeRepo(baseConfig(), {
    'docs/mechanisms/rules.md': '# Rules\n\n[a](gone.md) [b](README.md#nothing) [c](README.md#boundary) [d](https://x.test/y)\n',
  });
  const found = messages(structure(baseConfig(), root)).filter((line) => line.includes('dead'));
  assert.deepEqual(found, ['structure: dead relative link to gone.md', 'structure: dead relative link to README.md#nothing']);
});

test('paired-docs flags a changed mechanism whose doc is untouched, honours excludes and exempt', () => {
  const root = makeRepo();
  assert.deepEqual(messages(pairedDocs(baseConfig(), root, ['lib/a.mjs'])), [
    'paired-docs: mechanism rules changed without updating its doc docs/mechanisms/rules.md',
  ]);
  assert.deepEqual(pairedDocs(baseConfig(), root, ['lib/a.mjs', 'docs/mechanisms/rules.md']), []);
  assert.deepEqual(pairedDocs(baseConfig(), root, ['lib/skip.mjs']), []);
  const exempt = { mechanisms: [{ id: 'm', paths: ['lib/*'], doc: 'd.md', exempt: 'refactor' }] };
  assert.deepEqual(pairedDocs(exempt, root, ['lib/a.mjs']), []);
});

test('paired-docs matches like fnmatch: star crosses slashes', () => {
  const config = { mechanisms: [{ id: 'm', paths: ['web/*.json'], doc: 'd.md' }] };
  assert.equal(pairedDocs(config, '.', ['web/a/b.json']).length, 1);
  assert.equal(pairedDocs(config, '.', ['other/b.json']).length, 0);
});

test('declared-docs-resolve flags a doc that is missing or escapes the repository', () => {
  const root = makeRepo();
  const config = { mechanisms: [{ id: 'a', doc: 'docs/none.md' }, { id: 'b', doc: '/etc/hosts' }, { id: 'c' }] };
  assert.deepEqual(messages(declaredDocsResolve(config, root)), [
    'declared-docs-resolve: mechanism a declares a doc that does not exist: docs/none.md',
    'declared-docs-resolve: mechanism b declares a doc that does not exist: /etc/hosts',
    'declared-docs-resolve: mechanism c declares a doc that does not exist: None',
  ]);
  assert.deepEqual(declaredDocsResolve(baseConfig(), root), []);
});

test('section-readmes flags a missing README and a missing heading', () => {
  const root = makeRepo(baseConfig(), { 'docs/mechanisms/README.md': '# S\n\n## Boundary\n', 'docs/bare/x.md': '# X\n' });
  assert.ok(messages(sectionReadmes(baseConfig(), root)).includes('section-readmes: README.md missing heading: Shape'));
  assert.deepEqual(messages(sectionReadmes({ layers: { a: 'docs/bare/' } }, root)), ['section-readmes: layer root has no README.md']);
});

test('surface-rules flags a file over the line cap', () => {
  const root = makeRepo(baseConfig(), { 'AGENTS.md': 'x\n'.repeat(5) });
  const config = { surfaceRules: { lineCap: 4, paths: ['AGENTS.md'] } };
  assert.deepEqual(messages(surfaceRules(config, root)), ['surface-rules: 5 lines exceeds cap 4']);
  assert.deepEqual(surfaceRules({ surfaceRules: { lineCap: 5, paths: ['AGENTS.md'] } }, root), []);
});

test('findings print as [job] path: message', () => {
  assert.equal(formatFinding({ job: 'j', path: 'p.md', message: 'm' }), '[j] p.md: m');
});

test('slugify drops punctuation and joins words with hyphens', () => {
  assert.equal(slugifyHeading('  Update   Trigger! '), 'update-trigger');
});

const isolatedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

const gitRun = (root, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, env: isolatedEnv() });

test('resolveBase honours the config override and rejects option-shaped values', () => {
  const root = makeRepo();
  gitRun(root, 'init', '-q');
  gitRun(root, 'add', '.');
  gitRun(root, 'commit', '-qm', 'one');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', env: isolatedEnv() }).trim();
  assert.equal(resolveBase(root, {}), head);
  assert.equal(resolveBase(root, { base: 'HEAD' }), head);
  assert.throws(() => resolveBase(root, { base: '--output=x' }), /may not start with '-'/);
  assert.throws(() => resolveBase(root, { base: 'nope' }), /does not resolve to a commit/);
});

test('the command exits 0 when clean and 1 with findings', () => {
  const root = makeRepo();
  gitRun(root, 'init', '-q');
  gitRun(root, 'add', '.');
  gitRun(root, 'commit', '-qm', 'one');
  assert.equal(spawnSync('node', [SCRIPT], { cwd: root, env: isolatedEnv() }).status, 0);
  mkdirSync(join(root, 'lib'));
  writeFileSync(join(root, 'lib', 'a.mjs'), '');
  gitRun(root, 'add', '.');
  gitRun(root, 'commit', '-qm', 'two');
  const result = spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8', env: isolatedEnv() });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^\[paired-docs\] docs\/mechanisms\/rules.md: mechanism rules changed/);
});
