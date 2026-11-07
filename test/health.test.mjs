import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSource } from './fixtures/fake-source.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LIMITS, nextFails, assess, transition } from '../lib/health.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import { CONNECTORS } from '../connectors/index.mjs';
import { loadConfig, DEFAULT_RULES } from '../lib/config.mjs';
import './fixtures/demo-connector.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const MINUTE = 60000;
const base = Date.parse('2026-11-03T10:00:00Z');
const at = (minutes) => new Date(base + minutes * MINUTE).toISOString();

test('a failure streak grows per source, resets on success and forgets removed sources', () => {
  const first = nextFails({}, [{ id: 'a', failed: true }, { id: 'b', failed: false }]);
  assert.deepEqual(first, { a: 1 });
  assert.deepEqual(nextFails(first, [{ id: 'a', failed: true }, { id: 'b', failed: true }]), { a: 2, b: 1 });
  assert.deepEqual(nextFails({ a: 2, gone: 5 }, [{ id: 'a', failed: false }]), {});
});

test('failing needs the threshold, stale needs the age, and a workspace without sources is never stale', () => {
  const state = (fails, minutes, sourceCount = 1) => assess({ fails, freshAt: at(0), now: base + minutes * MINUTE, limits: DEFAULT_LIMITS, sourceCount });
  assert.equal(state({ a: 2 }, 5).ok, true);
  assert.deepEqual(state({ a: 3 }, 5).alerts, [{ id: 'failing:a', text: 'Source a has failed 3 polls in a row' }]);
  assert.equal(state({}, 14).stale, false);
  assert.deepEqual(state({}, 23).alerts, [{ id: 'stale', text: 'No fresh data for 23 minutes' }]);
  assert.equal(state({}, 600, 0).ok, true);
  assert.equal(assess({ fails: {}, freshAt: at(0), now: base + 3 * MINUTE, limits: { stale_minutes: 2, failing_polls: 1 }, sourceCount: 1 }).stale, true);
});

test('an alert is announced once, and its recovery is reported when the last one clears', () => {
  const stale = { id: 'stale', text: 'x' };
  const failing = { id: 'failing:a', text: 'y' };
  const raised = transition([], [stale]);
  assert.deepEqual(raised, { raised: [stale], recovered: [], alerted: ['stale'] });
  assert.deepEqual(transition(raised.alerted, [stale]).raised, []);
  assert.deepEqual(transition(['stale'], [stale, failing]).raised, [failing]);
  assert.deepEqual(transition(['stale', 'failing:a'], [failing]), { raised: [], recovered: ['stale'], alerted: ['failing:a'] });
});

test('the config takes the thresholds and refuses a non-positive one', () => {
  const load = (raw) => {
    const dir = scratchDir('whose-turn-');
    writeFileSync(join(dir, 'config.json'), JSON.stringify(raw));
    return loadConfig({ WHOSE_TURN_DATA: dir });
  };
  assert.deepEqual(load({ workspaces: [] }).health, DEFAULT_LIMITS);
  assert.deepEqual(load({ workspaces: [], stale_minutes: 5, failing_polls: 2 }).health, { stale_minutes: 5, failing_polls: 2 });
  const bad = load({ workspaces: [], stale_minutes: 0 });
  assert.equal(bad.health.stale_minutes, 15);
  assert.match(bad.problems[0], /stale_minutes must be a number from 1 to 1440; using 15/);
});

const flaky = (script) => {
  CONNECTORS.flaky = fakeSource({
    id: 'flaky',
    poll: async () => {
      if (script.fail) {
        throw new Error('boom');
      }
      return { tickets: [], comments: [], prs: [], activity: [], asks: [], me: 'pat' };
    },
  });
};

const workspace = (script, limits, dir = scratchDir('whose-turn-')) => {
  flaky(script);
  const sent = [];
  const built = createWorkspace(
    { id: 'w', name: 'Work', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'flaky', id: 'flaky' }] },
    { dataDir: dir, historyDays: 14, limits: () => limits, notify: (title, body) => sent.push({ title, body }) },
  );
  return { built, sent, dir };
};

test('a source that keeps failing raises one notification, persists the marker and recovers once', async () => {
  const script = { fail: true };
  const { built, sent, dir } = workspace(script, { stale_minutes: 15, failing_polls: 2 });
  await built.poll();
  assert.equal(built.summary().health.ok, true);
  await built.poll();
  assert.deepEqual(built.store.state.fails, { flaky: 2 });
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Source flaky has failed 2 polls in a row/);
  assert.deepEqual(built.store.marks.health_alerted, ['failing:flaky']);
  await built.poll();
  built.checkHealth();
  assert.equal(sent.length, 1);

  const restarted = workspace(script, { stale_minutes: 15, failing_polls: 2 }, dir).built;
  await restarted.poll();
  assert.equal(sent.length, 1);

  script.fail = false;
  await restarted.poll();
  assert.deepEqual(restarted.store.state.fails, {});
  assert.equal(restarted.summary().health.ok, true);
});

test('recovery is announced, and stale data is noticed without any poll running', async (t) => {
  const script = { fail: true };
  const { built, sent } = workspace(script, { stale_minutes: 15, failing_polls: 1 });
  t.mock.timers.enable({ apis: ['Date'], now: base });
  await built.poll();
  assert.equal(sent.length, 1);
  script.fail = false;
  await built.poll();
  assert.equal(built.summary().health.ok, true);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].title, 'Work: monitor recovered');
  t.mock.timers.tick(16 * MINUTE);
  built.checkHealth();
  assert.equal(built.summary().health.stale, true);
  assert.equal(sent.length, 3);
  assert.match(sent[2].body, /No fresh data/);
  built.checkHealth();
  assert.equal(sent.length, 3);
});

test('the open window is told when a failing streak grows, not only when an alert is raised or clears', async () => {
  const { built } = workspace({ fail: true }, { stale_minutes: 15, failing_polls: 1 });
  const versions = [];
  built.subscribe(() => versions.push(built.store.state.version));
  await built.poll();
  const first = built.snapshot().health.alerts[0].text;
  const before = built.store.state.version;
  await built.poll();
  assert.ok(built.store.state.version > before);
  assert.notEqual(built.snapshot().health.alerts[0].text, first);
  const steady = built.store.state.version;
  built.checkHealth();
  assert.equal(built.store.state.version, steady);
});

test('every stream message carries the workspace badge count', async () => {
  const built = createWorkspace(
    { id: 'n', name: 'Northwind', key_pattern: 'NW-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'demo', id: 'demo', scenario: 'northwind' }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, limits: () => DEFAULT_LIMITS, notify: () => {} },
  );
  const messages = [];
  built.subscribe((message) => messages.push(message));
  await built.poll();
  assert.ok(messages.length);
  assert.ok(built.summary().open_moves > 0);
  for (const message of messages) {
    assert.equal(message.open_moves, built.summary().open_moves);
  }
});

test('a workspace naming a connector type that is not registered reports it as unknown', async () => {
  const built = createWorkspace(
    { id: 'u', name: 'Unregistered', key_pattern: 'NW-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'nothing', id: 'nothing' }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, limits: () => DEFAULT_LIMITS, notify: () => {} },
  );
  await built.poll();
  assert.match(JSON.stringify(built.snapshot()), /Unknown source type \\"nothing\\"/);
});
