import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, listOf } from '../lib/text.mjs';

test('hostOf gives the host of a URL and an empty string for anything else', () => {
  assert.equal(hostOf('https://relay.example.com:8443/path'), 'relay.example.com:8443');
  assert.equal(hostOf('not a url'), '');
  assert.equal(hostOf(undefined), '');
});

test('listOf splits a comma list, trims it and drops empty entries', () => {
  assert.deepEqual(listOf(' a.example.com, ,b.example.com '), ['a.example.com', 'b.example.com']);
  assert.deepEqual(listOf(undefined), []);
});
