import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ago, age, when } from '../web/src/lib/time.ts';
import { setOrDrop } from '../web/src/lib/settings.ts';
import { checksTone, outcomeTone, isPrOnly, hasPrColumn } from '../web/src/lib/moves.ts';
import { workspaceIconParts, workspaceIconSvg } from '../web/src/lib/icons.ts';
import { mulberry32 } from '../web/src/lib/random.ts';
import { hasBody } from '../web/src/lib/feed.ts';
import { browserOf } from '../web/src/lib/browser.ts';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const before = (milliseconds) => new Date(NOW - milliseconds).toISOString();

test.beforeEach(() => mock.method(Date, 'now', () => NOW));
test.afterEach(() => mock.restoreAll());

test('ago says now under a minute, minutes under an hour, hours under 48 h, then a date', () => {
  assert.equal(ago(before(20 * 1000)), 'now');
  assert.equal(ago(before(MINUTE)), '1m ago');
  assert.equal(ago(before(59 * MINUTE)), '59m ago');
  assert.equal(ago(before(60 * MINUTE)), '1h ago');
  assert.equal(ago(before(47 * HOUR)), '47h ago');
  assert.match(ago(before(48 * HOUR)), /^[A-Z][a-z]{2} \d{1,2}$/);
});

test('ago of a bad or missing time is empty', () => {
  assert.equal(ago('not a date'), '');
  assert.equal(ago(''), '');
  assert.equal(ago(undefined), '');
});

test('ago of a time in the future reads as now', () => {
  assert.equal(ago(before(-10 * MINUTE)), 'now');
});

test('age labels under an hour as <1h, then hours, then days from 48 h', () => {
  assert.equal(age(before(30 * MINUTE)).text, '<1h');
  assert.equal(age(before(5 * HOUR)).text, '5h');
  assert.equal(age(before(47 * HOUR)).text, '47h');
  assert.equal(age(before(48 * HOUR)).text, '2d');
  assert.equal(age(before(100 * HOUR)).text, '4d');
});

test('age marks a row old from 24 h', () => {
  assert.equal(age(before(23 * HOUR)).old, false);
  assert.equal(age(before(24 * HOUR)).old, true);
  assert.equal(age(before(5 * HOUR)).hours, 5);
});

test('age of a negative, missing or bad time is empty', () => {
  const empty = { text: '', old: false, hours: 0 };
  assert.deepEqual(age(before(-HOUR)), empty);
  assert.deepEqual(age(undefined), empty);
  assert.deepEqual(age('nope'), empty);
});

test('when formats a time and is empty without one', () => {
  assert.equal(when(undefined), '');
  assert.equal(when(''), '');
  assert.match(when('2026-11-03T12:00:00Z'), /^Nov \d{1,2}, \d{2}:\d{2}/);
});

test('setOrDrop sets a non-empty value', () => {
  const target = {};
  setOrDrop(target, 'name', 'Work');
  setOrDrop(target, 'list', ['a']);
  assert.deepEqual(target, { name: 'Work', list: ['a'] });
});

test('setOrDrop drops a field when emptied', () => {
  const target = { name: 'Work', list: ['a'], other: 'x' };
  setOrDrop(target, 'name', '');
  setOrDrop(target, 'list', []);
  setOrDrop(target, 'other', undefined);
  assert.deepEqual(target, {});
});

test('setOrDrop always keeps a boolean, false included', () => {
  const target = {};
  setOrDrop(target, 'on', false);
  setOrDrop(target, 'off', true);
  assert.deepEqual(target, { on: false, off: true });
});

test('checksTone maps the check states to tones', () => {
  assert.equal(checksTone('failing'), 'bad');
  assert.equal(checksTone('running'), 'warn');
  assert.equal(checksTone('passing'), 'ok');
  assert.equal(checksTone('queued'), '');
  assert.equal(checksTone(undefined), '');
});

test('outcomeTone maps outcomes to tones and defaults to info', () => {
  assert.equal(outcomeTone('open'), 'info');
  assert.equal(outcomeTone('ready'), 'ready');
  assert.equal(outcomeTone('done'), 'ok');
  assert.equal(outcomeTone('dropped'), 'warn');
  assert.equal(outcomeTone('other'), 'info');
  assert.equal(outcomeTone(undefined), 'info');
});

test('hasBody is true only for a body-carrying kind with non-blank text', () => {
  assert.equal(hasBody({ kind: 'comment', body: 'hello' }), true);
  assert.equal(hasBody({ kind: 'review requested', body: 'look' }), true);
  assert.equal(hasBody({ kind: 'approved', body: '  \n ' }), false);
  assert.equal(hasBody({ kind: 'comment' }), false);
  assert.equal(hasBody({ kind: 'status', body: 'text' }), false);
});

test('a row whose PR key stands in for the ticket is PR-only, and the PR column shows only for a real PR', () => {
  const prOnly = { key: 'repo#7', pr: 'repo#7', ticket_url: '' };
  const ticketed = { key: 'PROJ-1', pr: '#7', ticket_url: 'https://x.example/PROJ-1' };
  assert.equal(isPrOnly(prOnly), true);
  assert.equal(isPrOnly(ticketed), false);
  assert.equal(hasPrColumn([prOnly, { key: 'PROJ-2', pr: '', ticket_url: 'u' }]), false);
  assert.equal(hasPrColumn([prOnly, ticketed]), true);
});

test('the workspace icon is a standalone SVG in the given colours with the glyph escaped', () => {
  const svg = workspaceIconSvg(workspaceIconParts({ id: 'garden', name: 'My Garden' }, mulberry32), { fill: '#111111', ink: '#222222', dot: '#333333' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 36 36">/);
  assert.ok(svg.includes('fill="#111111"') && svg.includes('fill="#222222"') && svg.includes('fill="#333333"'));
  assert.ok(svg.includes('>MG</text>'));
});

test('browserOf picks the real brand over Chromium and "Not A Brand", falls back to the user agent, and never returns the raw string', () => {
  const brands = (list) => ({ userAgent: 'x', userAgentData: { brands: list } });
  assert.deepEqual(browserOf(brands([{ brand: 'Not/A)Brand', version: '99' }, { brand: 'Chromium', version: '130' }, { brand: 'Google Chrome', version: '130' }])), { name: 'Chrome', version: '130' });
  assert.deepEqual(browserOf(brands([{ brand: 'Chromium', version: '130.0.1' }, { brand: 'Microsoft Edge', version: '130' }])), { name: 'Edge', version: '130' });
  assert.deepEqual(browserOf(brands([{ brand: 'Not A;Brand', version: '8' }, { brand: 'Chromium', version: '131' }])), { name: 'Chromium', version: '131' });
  assert.deepEqual(browserOf(brands([{ brand: 'Vivaldi', version: '7' }])), { name: 'Other', version: '7' });
  const agent = (userAgent) => browserOf({ userAgent });
  assert.deepEqual(agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'), { name: 'Safari', version: '18' });
  assert.deepEqual(agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0'), { name: 'Firefox', version: '132' });
  assert.deepEqual(agent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.5'), { name: 'Edge', version: '130' });
  assert.deepEqual(agent('Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'), { name: 'Chrome', version: '130' });
  assert.equal(agent('curl/8.0'), null);
});
