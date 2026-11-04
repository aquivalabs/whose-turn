// A short wiggle, at most every 30 seconds, while something wants attention; none under prefers-reduced-motion (RMA-311, docs/adr/0002-vueuse-in-the-window.md).
import { ref, watch, type Ref } from 'vue';
import { useIntervalFn, usePreferredReducedMotion, useTimeoutFn } from '@vueuse/core';

export const WIGGLE_MS = 800;
export const WIGGLE_EVERY_MS = 30000;

export const useAttention = (active: Ref<boolean>) => {
  const reduced = usePreferredReducedMotion();
  const wiggling = ref(false);
  const end = useTimeoutFn(() => (wiggling.value = false), WIGGLE_MS, { immediate: false });
  const wiggle = () => {
    if (reduced.value !== 'reduce') {
      wiggling.value = true;
      end.start();
    }
  };
  const ticker = useIntervalFn(wiggle, WIGGLE_EVERY_MS, { immediate: false });
  watch(
    active,
    (on) => {
      if (on) {
        wiggle();
        ticker.resume();
      } else {
        ticker.pause();
        end.stop();
        wiggling.value = false;
      }
    },
    { immediate: true },
  );
  return wiggling;
};
