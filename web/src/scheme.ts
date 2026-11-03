// The colour scheme in force, shared by the store, the backdrop and the sheet: the system preference.
import { computed } from 'vue';
import { usePreferredDark } from '@vueuse/core';

const prefersDark = usePreferredDark();

/** Whether the system prefers a dark scheme, read at call time. */
export const isDark = () => prefersDark.value;

/** Follows the system preference as it changes. */
export const dark = computed(isDark);
