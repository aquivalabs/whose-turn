import { MINUTE } from './text.mjs';

/** Health of one workspace's polling: how many polls in a row each source failed, how old the last data is, and which alerts that raises. */

export const DEFAULT_LIMITS = { stale_minutes: 15, failing_polls: 3 };

/** The failure streak per source after one poll; sources that answered drop out, sources no longer configured are forgotten. */
export const nextFails = (fails, outcomes) => Object.fromEntries(
  outcomes.filter((outcome) => outcome.failed).map((outcome) => [outcome.id, (fails[outcome.id] || 0) + 1]),
);

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const assess = ({ fails, freshAt, now, limits, sourceCount }) => {
  const ageMs = Math.max(0, now - Date.parse(freshAt));
  const stale = sourceCount > 0 && ageMs >= limits.stale_minutes * MINUTE;
  const failing = Object.entries(fails)
    .filter(([, polls]) => polls >= limits.failing_polls)
    .map(([source, polls]) => ({ source, polls }));
  const alerts = [
    ...(stale ? [{ id: 'stale', text: `No fresh data for ${plural(Math.floor(ageMs / MINUTE), 'minute')}` }] : []),
    ...failing.map(({ source, polls }) => ({ id: `failing:${source}`, text: `Source ${source} has failed ${plural(polls, 'poll')} in a row` })),
  ];
  return { ok: !alerts.length, stale, fresh_at: freshAt, failing, alerts };
};

/** Compares the alerts now with the ids already announced: what to announce, what cleared, and the ids to remember. */
export const transition = (alerted, alerts) => {
  const ids = alerts.map((alert) => alert.id);
  return {
    raised: alerts.filter((alert) => !alerted.includes(alert.id)),
    recovered: alerted.filter((id) => !ids.includes(id)),
    alerted: ids,
  };
};
