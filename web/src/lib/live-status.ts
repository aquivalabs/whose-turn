// The status line's verdict: the dot colour and the text, from the health block, the poll errors and the last check.
import { ago } from './time.ts';
import type { Health } from './types.ts';

export interface LiveStatus {
  dot: 'ok' | 'warn' | 'off';
  text: string;
  failing: string[];
  noData: boolean;
}

const CHECKS = ' · checks every minute';

/** The dot and text for the open workspace; sourceCount is how many connectors it has. */
export const liveStatus = (
  health: Health,
  polledAt: string,
  sourceCount: number,
  live: boolean,
): LiveStatus => {
  const failing = health.failing.map((item) => item.source);
  const checked = polledAt ? ago(polledAt) : '—';
  if (failing.length && failing.length >= sourceCount) {
    return {
      dot: 'off',
      text: 'No data: ' + failing.join(', ') + ' failing · last data ' + ago(health.fresh_at),
      failing,
      noData: true,
    };
  }
  if (health.stale) {
    return {
      dot: 'off',
      text: 'Stale · last data ' + ago(health.fresh_at) + CHECKS,
      failing,
      noData: false,
    };
  }
  if (failing.length) {
    return {
      dot: live ? 'warn' : 'off',
      text: failing.join(', ') + ' failing · last check ' + checked + CHECKS,
      failing,
      noData: false,
    };
  }
  return {
    dot: live ? 'ok' : 'off',
    text: 'Live · last check ' + checked + CHECKS,
    failing,
    noData: false,
  };
};
