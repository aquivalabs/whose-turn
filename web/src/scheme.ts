// The colour scheme in force, shared by the store, the backdrop and the sheet: a force-dark or force-light class on <html> wins over the system preference.
import { computed } from 'vue';
import { usePreferredDark } from '@vueuse/core';

const prefersDark = usePreferredDark();

/** Read at call time, so a forced class set after start-up counts on the next paint. */
export const isDark = () => {
  const root = document.documentElement.classList;
  if (root.contains('force-dark') || root.contains('force-light')) {
    return root.contains('force-dark');
  }
  return prefersDark.value;
};

/** Follows the system preference as it changes. */
export const dark = computed(isDark);
