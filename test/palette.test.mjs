import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paletteFrom, contrastRatio, derivedSeed, derivedSeeds } from '../lib/palette.mjs';
import { loadConfig, DEFAULT_RULES } from '../lib/config.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import './fixtures/demo-connector.mjs';

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

test('a workspace without a seed gets one derived from its id: stable, a hex, and different per id', () => {
  assert.equal(derivedSeed('marketplaces'), derivedSeed('marketplaces'));
  assert.match(derivedSeed('marketplaces'), /^#[0-9a-f]{6}$/);
  const seeds = ['marketplaces', 'sprut', 'whose-turn', 'demo', 'ws1', 'ws2'].map(derivedSeed);
  assert.equal(new Set(seeds).size, seeds.length);
});

test('derived seeds of one list keep clear of each other and of the configured seeds, and earlier entries never move', () => {
  const alone = derivedSeeds([{ id: 'northwind' }, { id: 'empty' }]);
  assert.notEqual(alone.northwind, alone.empty);
  const primary = (seed) => paletteFrom(seed).light['--md-primary'];
  assert.notEqual(primary(alone.northwind), primary(alone.empty));
  assert.equal(alone.northwind, derivedSeed('northwind'));
  const longer = derivedSeeds([{ id: 'northwind' }, { id: 'empty' }, { id: 'atlas' }]);
  assert.equal(longer.northwind, alone.northwind);
  assert.equal(longer.empty, alone.empty);
  const seeded = derivedSeeds([{ id: 'garden', seed: '#3d7a5c' }, { id: 'sprout' }]);
  assert.equal(seeded.garden, undefined);
  assert.notEqual(primary(seeded.sprout), primary('#3d7a5c'));
});

test('a workspace built without a theme still carries a scheme and names its seed; a configured seed wins', () => {
  const build = (definition) => createWorkspace(
    { key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'demo', scenario: 'northwind' }], ...definition },
    { dataDir: mkdtempSync(join(tmpdir(), 'whose-turn-')), historyDays: 14, http: {}, notify: () => {} },
  ).describe();
  const bare = build({ id: 'bare', name: 'Bare' });
  assert.equal(bare.theme_seed, derivedSeed('bare'));
  assert.ok(bare.theme?.light['--md-primary']);
  const seeded = build({ id: 'seeded', name: 'Seeded', theme: { seed: '#3d7a5c' } });
  assert.equal(seeded.theme_seed, '#3d7a5c');
  assert.deepEqual(seeded.theme, paletteFrom('#3d7a5c'));
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
  assert.equal(valid.derived_seed, undefined);
  assert.match(none.derived_seed, /^#[0-9a-f]{6}$/);
  assert.notEqual(none.derived_seed, invalid.derived_seed);
});
