// The status line's verdict: the dot colour and the text, from the health block, the poll errors and the last check.
import { ago } from './time.ts';
import type { Health } from './types.ts';
import { text } from '../i18n/index.ts';

export interface LiveStatus {
  dot: 'ok' | 'warn' | 'off';
  text: string;
  failing: string[];
  noData: boolean;
}

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
      text: text('core.live.noData', { failing: failing.join(', '), ago: ago(health.fresh_at) }),
      failing,
      noData: true,
    };
  }
  if (health.stale) {
    return {
      dot: 'off',
      text: text('core.live.stale', { ago: ago(health.fresh_at) }),
      failing,
      noData: false,
    };
  }
  if (failing.length) {
    return {
      dot: live ? 'warn' : 'off',
      text: text('core.live.failing', { failing: failing.join(', '), checked }),
      failing,
      noData: false,
    };
  }
  return {
    dot: live ? 'ok' : 'off',
    text: text('core.live.live', { checked }),
    failing,
    noData: false,
  };
};
