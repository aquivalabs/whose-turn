import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLinks } from '../lib/workspace.mjs';

const project = { label: 'Linear project', url: 'https://linear.app/acme/project/checkout-1a2b' };
const team = { label: 'Linear', url: 'https://linear.app/acme/team/NW' };
const repo = { label: 'GitHub', url: 'https://github.com/acme/shop' };

test('a connector link to a site the workspace already links is dropped; other connector links stay', () => {
  assert.deepEqual(mergeLinks([project], [team, repo]), [project, repo]);
});

test('without own links every connector link shows, and an exact repeat shows once', () => {
  assert.deepEqual(mergeLinks([], [team, repo, repo]), [team, repo]);
});

test('an own link with a malformed URL does not hide connector links', () => {
  assert.deepEqual(mergeLinks([{ label: 'Notes', url: 'not a url' }], [team]), [{ label: 'Notes', url: 'not a url' }, team]);
});
