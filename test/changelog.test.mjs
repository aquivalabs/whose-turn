import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadChangelog, parseChangelog } from '../lib/changelog.mjs';
import { appDir, startTestApi } from './fixtures/api.mjs';

const SAMPLE = `# Changelog

Intro text that belongs to no version.

## [Unreleased]

### Added
- A thing not yet released. RMA-1.

## [1.2.0] - 2026-11-04

### Fixed
- First fix with \`code\` and a [link](https://example.com).
  A continuation line of the same item.
- Second fix.

### Added
- New panel.

## [1.1.0] - 2026-11-01

## [1.0.0] - 2026-10-30

### Removed
- Old thing.
`;

test('versions come in file order with date, kinds and one markdown string per item', () => {
  // Setup
  const text = SAMPLE;
  // Exercise
  const versions = parseChangelog(text);
  // Verify
  assert.deepEqual(versions.map((entry) => entry.version), ['Unreleased', '1.2.0', '1.1.0', '1.0.0']);
  assert.deepEqual(versions[1], {
    version: '1.2.0',
    date: '2026-11-04',
    sections: [
      { kind: 'Fixed', items: ['First fix with `code` and a [link](https://example.com).\nA continuation line of the same item.', 'Second fix.'] },
      { kind: 'Added', items: ['New panel.'] },
    ],
  });
});

test('Unreleased has no date and keeps its sections', () => {
  const [unreleased] = parseChangelog(SAMPLE);
  assert.equal(unreleased.date, '');
  assert.deepEqual(unreleased.sections, [{ kind: 'Added', items: ['A thing not yet released.'] }]);
});

test('a version without sections is kept with an empty list', () => {
  const empty = parseChangelog(SAMPLE).find((entry) => entry.version === '1.1.0');
  assert.deepEqual(empty, { version: '1.1.0', date: '2026-11-01', sections: [] });
});

test('a malformed heading is skipped with its body and does not leak into the version above', () => {
  const text = '## [2.0.0] - 2026-11-05\n\n### Added\n- Kept.\n\n## 1.9.9 oops\n\n### Fixed\n- Dropped.\n\n## [\n- Also dropped.\n\n## [1.9.0] - 2026-11-02\n\n### Fixed\n- Back again.\n';
  const versions = parseChangelog(text);
  assert.deepEqual(versions.map((entry) => entry.version), ['2.0.0', '1.9.0']);
  assert.deepEqual(versions[0].sections, [{ kind: 'Added', items: ['Kept.'] }]);
});

test('a heading without a date keeps an empty date, and an empty or section-less text gives no versions', () => {
  assert.deepEqual(parseChangelog('## [3.0.0]\n'), [{ version: '3.0.0', date: '', sections: [] }]);
  assert.deepEqual(parseChangelog(''), []);
  assert.deepEqual(parseChangelog('# Changelog\n\nOnly prose.\n'), []);
});

test('Windows line endings parse the same', () => {
  assert.deepEqual(parseChangelog(SAMPLE.replaceAll('\n', '\r\n')), parseChangelog(SAMPLE));
});

test('the shipped CHANGELOG.md parses and the first released version has sections', () => {
  const reply = loadChangelog(appDir, '1.0.0');
  const [first] = reply.versions.filter((entry) => entry.version !== 'Unreleased');
  assert.ok(first.sections.length > 0);
});

test('loadChangelog answers null when the file is missing', () => {
  assert.equal(loadChangelog(mkdtempSync(join(tmpdir(), 'wt-changelog-')), '1.0.0'), null);
});

test('GET /api/changelog returns the current version and the released versions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-changelog-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), SAMPLE);
  const { server, get } = await startTestApi({ changelog: loadChangelog(dir, '1.2.0') });
  try {
    const reply = await (await get('/api/changelog')).json();
    assert.equal(reply.current, '1.2.0');
    assert.equal(reply.versions.length, 3);
  } finally {
    server.close();
  }
});

test('GET /api/changelog without a readable file is a CHANGELOG_UNAVAILABLE envelope', async () => {
  const { server, get } = await startTestApi();
  try {
    const response = await get('/api/changelog');
    const { error } = await response.json();
    assert.equal(response.status, 404);
    assert.equal(error.details[0].reason, 'CHANGELOG_UNAVAILABLE');
  } finally {
    server.close();
  }
});

test('an entry drops the tracker ids at its end or in brackets, and keeps ids inside a sentence and words like UTF-8', async () => {
  const { withoutIds } = await import('../lib/changelog.mjs');
  assert.equal(withoutIds('The launch agent finds node at every start. RMA-215.'), 'The launch agent finds node at every start.');
  assert.equal(withoutIds('Two header fixes. RMA-249, RMA-250.'), 'Two header fixes.');
  assert.equal(withoutIds('A test fixture (RMA-208) replaces the demo.'), 'A test fixture replaces the demo.');
  assert.equal(withoutIds('Since RMA-197 the store waited too long.'), 'Since RMA-197 the store waited too long.');
  assert.equal(withoutIds('Reads files in UTF-8.'), 'Reads files in UTF-8.');
  assert.equal(withoutIds('No ids here.'), 'No ids here.');
});

test('the API reply leaves out Unreleased: a user only reads versions that shipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-changelog-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), SAMPLE);
  assert.deepEqual(loadChangelog(dir, '1.2.0').versions.map((entry) => entry.version), ['1.2.0', '1.1.0', '1.0.0']);
});
