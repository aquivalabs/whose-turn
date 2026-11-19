// docs/mechanisms/storybook.md
import type { Decorator } from '@storybook/vue3';
import { snapshot, ui } from '@/store.ts';
import type { Snapshot } from '@/lib/types.ts';

/** A decorator that writes a slice of the server snapshot into the store before the story renders. */
export const withSnapshot =
  (sliceOf: (args: Record<string, unknown>) => Partial<Snapshot>): Decorator =>
  (story, context) => {
    Object.assign(snapshot, sliceOf(context.args));
    ui.live = true;
    return { components: { story }, template: '<story />' };
  };
