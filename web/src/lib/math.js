/** Two helpers the interpreter, the painter and the backdrop share. */
export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
