// Which of several overlapping requests may still be applied.

/** Numbers requests as they start; only the newest one's reply is accepted. */
export const latestWins = () => {
  let latest = 0;
  return {
    next: () => ++latest,
    accepts: (id: number) => id === latest,
  };
};
