/** The next poll delay in seconds: doubled up to 15 minutes while any source is rate limited, else the normal interval. */
export const nextDelay = (outcomes, delay, pollSeconds) => (outcomes.some((outcome) => outcome.rateLimited) ? Math.min(delay * 2, 15 * 60) : pollSeconds);

export const PARKED_EVERY_MS = 15 * 60 * 1000;

/** The workspace's hide modes: parked is checked rarely and returns by itself, paused is never checked. */
export const HIDDEN_MODES = ['parked', 'paused'];

/** Whether a workspace is polled in this round: always when shown, every 15 minutes when parked (its first check after a start is due 15 minutes after the stored last check, at once when there is none or it is older), never when paused. */
export const isDue = (hidden, lastPollAt, now) => {
  if (hidden === 'paused') {
    return false;
  }
  return hidden !== 'parked' || now - lastPollAt >= PARKED_EVERY_MS;
};
