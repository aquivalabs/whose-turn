// docs/mechanisms/storybook.md
import type { Decorator } from '@storybook/vue3';
import { snapshot, ui } from '@/store.ts';
import type { Snapshot } from '@/lib/types.ts';

/** A decorator that writes a slice of the server snapshot into the store once, when the story mounts or its controls change. */
export const withSnapshot =
  (sliceOf: (args: Record<string, unknown>) => Partial<Snapshot>): Decorator =>
  (story, context) => ({
    components: { story },
    setup: () => {
      Object.assign(snapshot, sliceOf(context.args));
      ui.live = true;
    },
    template: '<story />',
  });
