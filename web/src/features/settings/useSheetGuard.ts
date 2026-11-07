// What both settings sheets share: the unsaved-changes flag, the confirm bar's question, and Escape asking before it drops edits.
import { ref, watch } from 'vue';
import { text } from '@/i18n/index.ts';
import { ui } from '@/store.ts';

export interface Ask {
  text: string;
  yes: string;
  no: string;
  run: () => void;
}

export const useSheetGuard = (isOpen: () => boolean, isDirty: () => boolean, close: () => void) => {
  const ask = ref<Ask | null>(null);
  const askDiscard = () => {
    ask.value = {
      text: text('settings.guard.discardQuestion'),
      yes: text('settings.guard.discard'),
      no: text('settings.guard.keepEditing'),
      run: close,
    };
  };
  const requestClose = () => (isDirty() ? askDiscard() : close());
  const answer = (yes: boolean) => {
    const pending = ask.value;
    ask.value = null;
    if (yes) {
      pending?.run();
    }
  };
  watch(
    isDirty,
    (dirty) => {
      ui.settingsDirty = dirty;
    },
    { immediate: true },
  );
  watch(
    () => ui.settingsAsk,
    (asked) => {
      if (asked && isOpen()) {
        ui.settingsAsk = false;
        askDiscard();
      }
    },
  );
  return { ask, requestClose, answer };
};
