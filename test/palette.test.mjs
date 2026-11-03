import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paletteFrom, contrastRatio } from '../lib/palette.mjs';
import { loadConfig } from '../lib/config.mjs';

const STYLESHEET = readFileSync(new URL('../web/src/styles/tokens.css', import.meta.url), 'utf8');
const KEPT_FROM_STYLESHEET = /warn|font|-r-|^--glass-/;

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

const hslSeed = (hue) => {
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (0.5 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${[0, 8, 4].map(channel).join('')}`;
};

const SEEDS = [['#4a7bd0'], ['#3d7a5c', '#c27a2c'], ['#ffeb3b'], ['#111111'], ['#e0218a', '#00ffcc']];

test('the scheme covers every colour variable the stylesheet defines, light and dark', () => {
  const expected = schemeVariables();
  assert.ok(expected.light.length >= 20 && expected.dark.length >= 20);
  const palette = paletteFrom('#3d7a5c');
  for (const scheme of ['light', 'dark']) {
    for (const name of expected[scheme]) {
      assert.ok(name in palette[scheme], `${scheme} is missing ${name}`);
    }
    assert.ok(!Object.keys(palette[scheme]).some((name) => KEPT_FROM_STYLESHEET.test(name)), 'warn stays in the stylesheet');
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

const rgbOf = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const rgbDistance = (first, second) => Math.hypot(...rgbOf(first).map((channel, index) => channel - rgbOf(second)[index]));
const MIN_RGB_DISTANCE = 45;
const WHEEL_SEEDS = Array.from({ length: 12 }, (_, step) => [hslSeed(step * 30)]);
const DEMO_SEEDS = [['#3d7a5c', '#c27a2c'], ['#4a7bd0'], ['#e8623c']];

test('the error colour stays 45 RGB units (Euclidean, 0 to 255 per channel) from the primary, light and dark', () => {
  for (const [seed, accent] of [...WHEEL_SEEDS, ...DEMO_SEEDS]) {
    const palette = paletteFrom(seed, accent);
    for (const scheme of ['light', 'dark']) {
      const distance = rgbDistance(palette[scheme]['--md-primary'], palette[scheme]['--md-error']);
      assert.ok(distance >= MIN_RGB_DISTANCE, `${seed} ${scheme} primary ${palette[scheme]['--md-primary']} against error ${palette[scheme]['--md-error']} is ${distance.toFixed(0)}`);
      assert.ok(contrastRatio(palette[scheme]['--md-error'], palette[scheme]['--md-surface']) >= 4.5, `${seed} ${scheme} error is unreadable on the surface`);
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
