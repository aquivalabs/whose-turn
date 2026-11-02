/** Seeded random for the backdrop: the same seed always draws the same animal. */
export const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomTools = (seed) => {
  const next = mulberry32(seed);
  const range = (low, high) => low + (high - low) * next();
  return {
    next,
    range,
    int: (low, high) => Math.floor(range(low, high + 1)),
    chance: (probability) => next() < probability,
    vary: (value, spread = 0.12) => value * range(1 - spread, 1 + spread),
  };
};
