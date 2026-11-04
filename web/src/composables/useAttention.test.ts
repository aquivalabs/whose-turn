import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useAttention, WIGGLE_EVERY_MS, WIGGLE_MS } from './useAttention.ts';

const motion = (reduce: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
const start = (active: boolean) => {
  const flag = ref(active);
  const scope = effectScope();
  const wiggling = scope.run(() => useAttention(flag))!;
  return { flag, wiggling, scope };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('news wiggles at once for under a second, then at most every 30 seconds', async () => {
  motion(false);
  const { wiggling, scope } = start(true);
  expect(wiggling.value).toBe(true);
  vi.advanceTimersByTime(WIGGLE_MS);
  expect(wiggling.value).toBe(false);
  vi.advanceTimersByTime(WIGGLE_EVERY_MS - WIGGLE_MS - 1);
  expect(wiggling.value).toBe(false);
  vi.advanceTimersByTime(1);
  expect(wiggling.value).toBe(true);
  scope.stop();
});

test('without news there is no wiggle, and calming down stops the repeats', async () => {
  motion(false);
  const { flag, wiggling, scope } = start(false);
  vi.advanceTimersByTime(WIGGLE_EVERY_MS * 2);
  expect(wiggling.value).toBe(false);
  flag.value = true;
  await nextTick();
  expect(wiggling.value).toBe(true);
  flag.value = false;
  await nextTick();
  expect(wiggling.value).toBe(false);
  vi.advanceTimersByTime(WIGGLE_EVERY_MS * 2);
  expect(wiggling.value).toBe(false);
  scope.stop();
});

test('under reduced motion the dot stays and nothing wiggles', () => {
  motion(true);
  const { wiggling, scope } = start(true);
  vi.advanceTimersByTime(WIGGLE_EVERY_MS * 2);
  expect(wiggling.value).toBe(false);
  scope.stop();
});
