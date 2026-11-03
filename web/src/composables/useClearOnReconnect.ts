import { watch } from 'vue';
import { ui } from '@/store.ts';

/** Runs `clear` each time the event stream reopens: a problem line that stood for a lost connection must not outlive it. */
export const useClearOnReconnect = (clear: () => void) => {
  watch(() => ui.reconnects, clear);
};
