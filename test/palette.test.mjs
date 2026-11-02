import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paletteFrom, contrastRatio } from '../lib/palette.mjs';
import { loadConfig } from '../lib/config.mjs';

const STYLESHEET = readFileSync(new URL('../web/src/styles/tokens.css', import.meta.url), 'utf8');
const KEPT_FROM_STYLESHEET = /warn|error|font|-r-|^--glass-/;

const schemeVariables = () => {
  const names = [...new Set([...STYLESHEET.matchAll(/(--(?:md-|glass|blob-)[\w-]*)\s*:/g)].map((match) => match[1]))].filter((name) => !KEPT_FROM_STYLESHEET.test(name));
  return { light: names, dark: names };
};

const CONTAINER_PAIRS = [
  ['--md-on-primary', '--md-primary'],
  ['--md-on-primary-container', '--md-primary-container'],
  ['--md-on-secondary-container', '--md-secondary-container'],
  ['--md-on-tertiary-container', '--md-tertiary-container'],
  ['--md-on-surface', '--md-surface'],
  ['--md-on-surface-variant', '--md-s-low'],
];

const SEEDS = [['#4a7bd0'], ['#3d7a5c', '#c27a2c'], ['#ffeb3b'], ['#111111'], ['#e0218a', '#00ffcc']];

test('the scheme covers every colour variable the stylesheet defines, light and dark', () => {
  const expected = schemeVariables();
  assert.ok(expected.light.length >= 20 && expected.dark.length >= 20);
  const palette = paletteFrom('#3d7a5c');
  for (const scheme of ['light', 'dark']) {
    for (const name of expected[scheme]) {
      assert.ok(name in palette[scheme], `${scheme} is missing ${name}`);
    }
    assert.ok(!Object.keys(palette[scheme]).some((name) => KEPT_FROM_STYLESHEET.test(name)), 'warn and error stay in the stylesheet');
  }
});

test('every on-colour reaches 4.5:1 against its container', () => {
  for (const [seed, accent] of SEEDS) {
    const palette = paletteFrom(seed, accent);
    for (const scheme of ['light', 'dark']) {
      for (const [ink, ground] of CONTAINER_PAIRS) {
        const ratio = contrastRatio(palette[scheme][ink], palette[scheme][ground]);
        assert.ok(ratio >= 4.5, `${seed} ${scheme} ${ink} on ${ground} is ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('the same seed gives the same scheme, another seed another one', () => {
  assert.deepEqual(paletteFrom('#3d7a5c', '#c27a2c'), paletteFrom('#3d7a5c', '#c27a2c'));
  assert.notEqual(paletteFrom('#3d7a5c').light['--md-primary'], paletteFrom('#c27a2c').light['--md-primary']);
});

test('the config loader keeps a valid theme and drops an invalid seed or accent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whose-turn-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ workspaces: [
    { id: 'valid', theme: { seed: '#3D7A5C', accent: 'orange' } },
    { id: 'invalid', theme: { seed: 'blue', accent: '#c27a2c' } },
    { id: 'none' },
  ] }));
  const [valid, invalid, none] = loadConfig({ WHOSE_TURN_DATA: dir }).workspaces;
  assert.deepEqual(valid.theme, { seed: '#3d7a5c' });
  assert.equal(invalid.theme, null);
  assert.equal(none.theme, null);
});
