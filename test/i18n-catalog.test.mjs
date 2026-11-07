import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../web/src/i18n/en/index.ts';
import { text } from '../web/src/i18n/index.ts';

const leaves = (tree, prefix = '') => Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`)));

test('every catalog message renders to text, never to its own key, and no message trips the message syntax (RMA-342)', () => {
  // Setup
  const all = leaves(en);
  // Exercise
  const broken = all.filter(([key]) => {
    const shown = text(key, new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? `<${name}>` : undefined), has: () => true }), 2);
    return !shown || shown === key;
  });
  const syntax = all.filter(([, message]) => /@|\{\s*\}/.test(message.replaceAll("{'@'}", '')) || (message.includes('|') && !/^[^|]+ \| [^|]+$/.test(message)));
  // Verify
  assert.ok(all.length > 300, `only ${all.length} messages`);
  assert.deepEqual(broken, []);
  assert.deepEqual(syntax, []);
});
