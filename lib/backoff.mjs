/** The next poll delay in seconds: doubled up to 15 minutes while any source is rate limited, else the normal interval. */
export const nextDelay = (outcomes, delay, pollSeconds) => (outcomes.some((outcome) => outcome.rateLimited) ? Math.min(delay * 2, 15 * 60) : pollSeconds);
