// docs/mechanisms/storybook.md
import type { Decorator } from '@storybook/vue3';
import { onMounted, toRaw } from 'vue';
import { snapshot, ui } from '@/store.ts';
import type { Snapshot } from '@/lib/types.ts';
import { answer, goOffline, resetServer } from './fake-server.ts';
import type { Handler } from './fake-server.ts';

type Ui = typeof ui;
type Flag = { [Key in keyof Ui]: Ui[Key] extends boolean ? Key : never }[keyof Ui];

/** What a story puts in place before its component renders. */
export interface StoryState {
  snapshot?: Partial<Snapshot>;
  ui?: Partial<Ui>;
  /** Browser storage keys, such as a remembered fold. */
  storage?: Record<string, string>;
  /** `ui` flags turned on after mount, as a click would: a sheet loads when its flag changes. */
  open?: Flag[];
  /** Routes of the fake server for this story, or `offline` for an unreachable server. */
  server?: Record<string, Handler> | 'offline';
}

const initialSnapshot = structuredClone(toRaw(snapshot));
const initialUi = structuredClone({ ...toRaw(ui) });

/** Puts the store, the stored keys and the fake server back as the first story found them; the preview calls it before each story. */
export const resetStory = () => {
  Object.assign(snapshot, structuredClone(initialSnapshot));
  Object.assign(ui, structuredClone(initialUi), { live: true });
  Object.keys(localStorage)
    .filter((key) => key.startsWith('wt-') && key !== 'wt-scheme')
    .forEach((key) => localStorage.removeItem(key));
  resetServer();
};

/** A decorator that applies the story's state, built from its args, when the story mounts. */
export const withState =
  <Args>(stateOf: (args: Args) => StoryState): Decorator =>
  (story, context) => ({
    components: { story },
    setup: () => {
      const state = stateOf(context.args as Args);
      Object.assign(snapshot, structuredClone(state.snapshot ?? {}));
      Object.assign(ui, state.ui ?? {});
      Object.entries(state.storage ?? {}).forEach(([key, value]) => localStorage.setItem(key, value));
      if (state.server === 'offline') {
        goOffline();
      } else {
        Object.entries(state.server ?? {}).forEach(([path, handler]) => answer(path, handler));
      }
      onMounted(() => (state.open ?? []).forEach((flag) => (ui[flag] = true)));
    },
    template: '<story />',
  });
