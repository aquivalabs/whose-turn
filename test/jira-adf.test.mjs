import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adfToText } from '../connectors/jira.mjs';

const text = (value) => ({ type: 'text', text: value });

test('a mention of me renders as my name, other mentions keep theirs, media becomes [image]', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'me-id', text: '@Alex' } }, text(' and '), { type: 'mention', attrs: { id: 'x', text: '@Sam Reviewer' } }] },
    { type: 'mediaSingle', content: [{ type: 'media' }] },
  ] };
  assert.equal(adfToText(doc, 'me-id', 'Alex Doe').trim(), '@Alex Doe and @Sam Reviewer\n\n[image]');
});

test('lists, code and links keep a markdown-ish shape', () => {
  const doc = { type: 'doc', content: [
    { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('first')] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [text('second')] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://example.com/docs' } }] }, { type: 'text', text: 'x', marks: [{ type: 'code' }] }] },
  ] };
  assert.equal(adfToText(doc, 'me', 'Me').trim(), '1. first\n2. second\n\n[docs](https://example.com/docs)`x`');
});
