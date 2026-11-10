import { watch, nextTick, type Ref } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import { ui } from '@/store.ts';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const TYPING = 'input, textarea, select, [contenteditable]';

/** The element to focus after Tab or Shift+Tab inside a dialog, wrapping at the ends; null when the browser's own move stays inside. */
export const wrapTarget = (items: HTMLElement[], active: Element | null, backwards: boolean) => {
  if (!items.length) {
    return null;
  }
  const edge = backwards ? items[0] : items[items.length - 1];
  if (active === edge || !items.some((item) => item === active)) {
    return backwards ? items[items.length - 1] : items[0];
  }
  return null;
};

/** Keeps Tab inside the topmost dialog while one is open and gives focus back to what had it before. */
export const useDialogFocus = (covered: Ref<boolean>) => {
  let before: HTMLElement | null = null;
  watch(covered, (isCovered) => {
    if (isCovered) {
      before = document.activeElement as HTMLElement | null;
      void nextTick(() => {
        const dialogs = document.querySelectorAll<HTMLElement>('.modal');
        const dialog = dialogs[dialogs.length - 1];
        if (dialog && !dialog.contains(document.activeElement)) {
          dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }
      });
    } else {
      before?.focus();
      before = null;
    }
  });
  onKeyStroke(
    'Tab',
    (event) => {
      if (!covered.value) {
        return;
      }
      const dialogs = document.querySelectorAll<HTMLElement>('.modal');
      const dialog = dialogs[dialogs.length - 1];
      const items = dialog ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
      const target = wrapTarget(items, document.activeElement, event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    },
    { target: document },
  );
};

type Shortcut = 'search' | 'todo' | 'help';
const BY_KEY: Record<string, Shortcut> = { '/': 'search', t: 'todo', '?': 'help' };
const BY_CODE: Record<string, Shortcut> = { Slash: 'search', KeyT: 'todo', 'Shift+Slash': 'help' };
const FIELDS: Record<Exclude<Shortcut, 'help'>, string> = {
  search: '.feed__search-input',
  todo: '.todos__input',
};

/** The shortcut a key press means: by the character typed, else by the physical key, so any layout works. */
export const shortcutOf = (event: KeyboardEvent): Shortcut | undefined =>
  BY_KEY[event.key] ?? BY_CODE[(event.shiftKey ? 'Shift+' : '') + event.code];

/** "/" focuses the feed search, "t" the to-do field and "?" opens Help, unless a field or a dialog has the keyboard. */
export const useShortcuts = (covered: Ref<boolean>) =>
  onKeyStroke(
    true,
    (event) => {
      const shortcut = shortcutOf(event);
      const target = event.target as HTMLElement | null;
      if (!shortcut || covered.value || event.metaKey || event.ctrlKey || event.altKey || target?.closest?.(TYPING)) {
        return;
      }
      if (shortcut === 'help') {
        event.preventDefault();
        ui.help = true;
        return;
      }
      const field = document.querySelector<HTMLElement>(FIELDS[shortcut]);
      if (field) {
        event.preventDefault();
        field.focus();
      }
    },
    { target: document },
  );
