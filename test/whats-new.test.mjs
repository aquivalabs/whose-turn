import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unseenVersions, versionMarkdown } from '../web/src/lib/whats-new.ts';

const entry = (version, sections = []) => ({ version, date: '2026-11-01', sections });
const versions = [entry('Unreleased'), entry('1.3.0'), entry('1.2.0'), entry('1.1.0'), entry('1.0.0')];
const names = (list) => list.map((one) => one.version);

test('the versions after the last seen one, up to the running one, are unseen, newest first', () => {
  assert.deepEqual(names(unseenVersions(versions, '1.1.0', '1.3.0')), ['1.3.0', '1.2.0']);
});

test('nothing is unseen when the last seen version is the running one', () => {
  assert.deepEqual(unseenVersions(versions, '1.3.0', '1.3.0'), []);
});

test('Unreleased is never unseen, and versions newer than the running one are left out', () => {
  assert.deepEqual(names(unseenVersions(versions, '1.0.0', '1.2.0')), ['1.2.0', '1.1.0']);
});

test('a first visit with nothing stored shows no dot', () => {
  assert.deepEqual(unseenVersions(versions, '', '1.3.0'), []);
});

test('a last seen version the changelog does not know counts only the running one', () => {
  assert.deepEqual(names(unseenVersions(versions, '0.9.0', '1.3.0')), ['1.3.0']);
});

test('a running version missing from the changelog gives nothing', () => {
  assert.deepEqual(unseenVersions(versions, '1.0.0', '9.9.9'), []);
});

test('a version becomes Markdown with a heading per kind and a list of items', () => {
  const text = versionMarkdown(entry('1.0.0', [{ kind: 'Fixed', items: ['One.', 'Two.'] }, { kind: 'Added', items: ['Three.'] }]));
  assert.equal(text, '### Fixed\n- One.\n- Two.\n\n### Added\n- Three.');
});
