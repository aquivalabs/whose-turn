// What both settings sheets share: the unsaved-changes flag, the confirm bar's question, and Escape asking before it drops edits.
import { ref, watch } from 'vue';
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
    ask.value = { text: 'Discard changes?', yes: 'Discard', no: 'Keep editing', run: close };
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
