// The colour scheme in force, shared by the store, the backdrop and the sheet: ?scheme= in the address, else the choice kept in this browser, else the system. RMA-451, RMA-457.
import { computed, watch } from 'vue';
import { useEventListener, useLocalStorage, useMutationObserver, usePreferredDark } from '@vueuse/core';
import type { SchemeVariables, Theme } from './lib/types.ts';

/** What the user picked: follow the system, or one scheme. */
export type SchemeChoice = 'system' | 'light' | 'dark';

const CHOICES: readonly SchemeChoice[] = ['system', 'light', 'dark'];
const isChoice = (value: unknown): value is SchemeChoice => CHOICES.includes(value as SchemeChoice);
const prefersDark = usePreferredDark();
const fromAddress = new URLSearchParams(location.search).get('scheme');
const pinned = fromAddress === 'light' || fromAddress === 'dark' ? fromAddress : null;
const stored = useLocalStorage<SchemeChoice>('wt-scheme', 'system', { writeDefaults: false });

/** Whether the address pins the scheme, so the switch has no say. */
export const pinnedByAddress = pinned !== null;

/** The choice in force: the address wins over the stored one. */
export const schemeChoice = computed<SchemeChoice>(() => pinned ?? (isChoice(stored.value) ? stored.value : 'system'));

/** The choice after this one: System, then Light, then Dark, then System again. */
const nextChoice = (choice: SchemeChoice): SchemeChoice => CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length];

/** Moves the stored choice on by one. */
export const cycleScheme = () => {
  stored.value = nextChoice(schemeChoice.value);
};

/** A workspace theme's variables for the scheme in force, or none without a theme. */
export const themeVariablesOf = (theme: Theme | null | undefined): SchemeVariables =>
  theme?.light && theme.dark ? theme[isDark() ? 'dark' : 'light'] : {};

/** Whether the dark scheme is in force, read at call time. */
export const isDark = () => (schemeChoice.value === 'system' ? prefersDark.value : schemeChoice.value === 'dark');

/** Follows the choice and the system preference as they change. */
export const dark = computed(isDark);

const originals = new WeakMap<CSSMediaRule, string>();

/** Points every prefers-color-scheme rule at the choice, or back at the system for System. */
export const pinStylesheets = () => {
  const choice = schemeChoice.value;
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule)) {
        continue;
      }
      const original = originals.get(rule) ?? rule.media.mediaText;
      if (!original.includes('prefers-color-scheme')) {
        continue;
      }
      originals.set(rule, original);
      const target = choice === 'system' ? original : original.includes(choice) ? 'all' : 'not all';
      if (rule.media.mediaText !== target) {
        rule.media.mediaText = target;
      }
    }
  }
};

/** Pins the stylesheets now, on every change of the choice, and for each stylesheet added later. */
export const installScheme = () => {
  pinStylesheets();
  watch(schemeChoice, pinStylesheets);
  useMutationObserver(document.head, pinStylesheets, { childList: true });
  useEventListener(document.head, 'load', pinStylesheets, { capture: true });
};
