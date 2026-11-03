import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineTokens, markdownTokens } from '../web/src/lib/markdown-tokens.ts';

const links = (tokens) => tokens.filter((token) => token.type === 'link');

test('renders bold, a link and a list', () => {
  const blocks = markdownTokens('**hi** [docs](https://example.com/a)\n- one\n- two');
  assert.deepEqual(blocks[0].lines[0].map((t) => t.type), ['strong', 'text', 'link']);
  assert.equal(blocks[1].type, 'list');
  assert.equal(blocks[1].items.length, 2);
});

test('only https links are followed; javascript: and data: stay text', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', 'JAVASCRIPT:alert(1)']) {
    assert.deepEqual(links(inlineTokens(`[x](${url})`)), [], url);
    assert.deepEqual(links(inlineTokens(url)), [], url);
  }
  assert.equal(links(inlineTokens('[x](https://example.com)'))[0].href, 'https://example.com');
  assert.equal(links(inlineTokens('see https://example.com now'))[0].href, 'https://example.com');
});

test('markup in text stays literal text', () => {
  const tokens = inlineTokens('<script>alert(1)</script> <b>x</b> <img src=x onerror=alert(1)>');
  assert.deepEqual(tokens, [{ type: 'text', text: '<script>alert(1)</script> <b>x</b> <img src=x onerror=alert(1)>' }]);
  const marked = inlineTokens('**<script>** `<b>x</b>`');
  assert.deepEqual(marked.filter((t) => t.type !== 'text').map((t) => t.text), ['<script>', '<b>x</b>']);
});

test('html comments are dropped', () => {
  assert.deepEqual(markdownTokens('a<!-- hidden -->b')[0].lines[0], [{ type: 'text', text: 'ab' }]);
});

test('nested marks are not parsed again', () => {
  const tokens = inlineTokens('**a `b <i>`** and *c [d](https://e.com)*');
  assert.deepEqual(tokens[0], { type: 'strong', text: 'a `b <i>`' });
  assert.ok(tokens.every((t) => t.type !== 'link'));
});

test('an unterminated fence runs to the end and stays text', () => {
  const blocks = markdownTokens('before\n```\n<script>x</script>\n[a](javascript:1)');
  assert.deepEqual(blocks[1], { type: 'fence', text: '<script>x</script>\n[a](javascript:1)' });
});

test('hostile 100 KB inputs finish quickly', () => {
  const inputs = [
    '['.repeat(100_000),
    '`'.repeat(100_000),
    '*'.repeat(100_000),
    '**a '.repeat(25_000),
    '[a](https://x '.repeat(7_000),
    'https://'.repeat(12_000),
    '@a '.repeat(33_000),
    '- '.repeat(50_000),
    '> '.repeat(50_000),
    '```\n'.repeat(25_000),
    'word '.repeat(20_000),
  ];
  for (const input of inputs) {
    const start = performance.now();
    markdownTokens(input);
    const ms = performance.now() - start;
    assert.ok(ms < 1000, `${input.slice(0, 12)} took ${Math.round(ms)} ms`);
  }
});
