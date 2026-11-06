import { expect, it } from 'vitest';
import { describeWindow, panelUnder, recentApiFailures, trackApiFailure, visibleShare } from './window-report.ts';

const closed = { settings: false, monitor: false, whatsNew: false, modal: null, note: '' };
const env = {
  layers: closed,
  fontPx: 16,
  consoleErrors: 1,
  reconnects: 3,
  lastEventAt: 1_000_000,
  now: 1_000_000 + 7 * 60000 + 5,
  apiFailures: [502],
  boxes: { your_move: { clientHeight: 300, scrollHeight: 900 }, waiting: null, feed: { clientHeight: 500, scrollHeight: 0 } },
};

it('names the view under the sheet by the open layer, the dashboard when none is open', () => {
  expect(panelUnder(closed)).toBe('dashboard');
  expect(panelUnder({ ...closed, settings: true, monitor: true })).toBe('settings');
  expect(panelUnder({ ...closed, monitor: true })).toBe('monitor_settings');
  expect(panelUnder({ ...closed, whatsNew: true })).toBe('whats_new');
  expect(panelUnder({ ...closed, modal: {} })).toBe('comment');
  expect(panelUnder({ ...closed, note: 'row' })).toBe('note');
});

it('gives the share of a list in view as a whole percent, capped at 100, and nothing for an empty or missing list', () => {
  expect(visibleShare({ clientHeight: 300, scrollHeight: 900 })).toBe(33);
  expect(visibleShare({ clientHeight: 600, scrollHeight: 500 })).toBe(100);
  expect(visibleShare({ clientHeight: 600, scrollHeight: 0 })).toBeUndefined();
  expect(visibleShare(null)).toBeUndefined();
});

it('describes the window: reconnects after the first connection, whole minutes since the last event, and only the lists it could measure', () => {
  expect(describeWindow(env)).toEqual({
    panel: 'dashboard',
    font_px: 16,
    console_errors: 1,
    stream_reconnects: 2,
    stream_last_event_minutes: 7,
    api_failures: [502],
    scroll: { your_move: 33 },
  });
  const quiet = describeWindow({ ...env, reconnects: 0, lastEventAt: 0 });
  expect(quiet.stream_reconnects).toBe(0);
  expect('stream_last_event_minutes' in quiet).toBe(false);
});

it('keeps only the last ten refused API calls', () => {
  for (let status = 400; status < 412; status += 1) {
    trackApiFailure(status);
  }
  expect(recentApiFailures()).toEqual([402, 403, 404, 405, 406, 407, 408, 409, 410, 411]);
});
