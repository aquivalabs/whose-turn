// The colour scheme in force, shared by the store, the backdrop and the sheet: the system preference, or the one ?scheme=light or ?scheme=dark pins.
import { computed } from 'vue';
import { usePreferredDark } from '@vueuse/core';

const prefersDark = usePreferredDark();
const forced = new URLSearchParams(location.search).get('scheme');

/** Whether the dark scheme is in force, read at call time. */
export const isDark = () => (forced === 'dark' || forced === 'light' ? forced === 'dark' : prefersDark.value);

/** Follows the system preference as it changes. */
export const dark = computed(isDark);

/** Pins every prefers-color-scheme rule to the forced scheme. */
export const pinStylesheets = () => {
  if (forced !== 'dark' && forced !== 'light') {
    return;
  }
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText.includes('prefers-color-scheme')) {
        rule.media.mediaText = rule.media.mediaText.includes(forced) ? 'all' : 'not all';
      }
    }
  }
};
