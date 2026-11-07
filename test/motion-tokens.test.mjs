import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../web/src/${path}`, import.meta.url), 'utf8');

test('the JavaScript motion tokens mirror the stylesheet tokens', () => {
  const css = read('styles/tokens.css');
  const code = read('motion.ts');
  const seconds = /DURATION = \{ fast: ([\d.]+), base: ([\d.]+), slow: ([\d.]+) \}/.exec(code);
  const ease = /EASE: \[number, number, number, number\] = \[([^\]]+)\]/.exec(code);
  assert.ok(seconds && ease, 'motion.ts declares DURATION and EASE');
  const millis = (name) => Number(new RegExp(`--motion-${name}: (\\d+)ms`).exec(css)?.[1]);
  assert.deepEqual(
    ['fast', 'base', 'slow'].map(millis),
    seconds.slice(1).map((value) => Math.round(Number(value) * 1000)),
  );
  assert.ok(css.includes(`--motion-ease: cubic-bezier(${ease[1]})`));
});

test('reduced motion zeroes every stylesheet duration', () => {
  const css = read('styles/tokens.css');
  const reduced = /prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/.exec(css)?.[1] ?? '';
  for (const name of ['fast', 'base', 'slow']) {
    assert.match(reduced, new RegExp(`--motion-${name}: 0ms`));
  }
});
