import { expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { render, screen } from '@testing-library/vue';
import { LazyMotion, MotionConfig } from 'motion-v';
import { snapshot } from '@/store.ts';
import { backlogRow } from '@/test-rows.ts';
import { loadFeatures } from '@/motion.ts';
import Waiting from './Waiting.vue';

// docs/mechanisms/motion.md § The empty text waits for the list
vi.mock('motion-v', () => vi.importActual('motion-v'));

const EMPTY = 'Nothing is waiting on someone else.';
let releaseFeatures = () => {};
const loadSlowly = () => new Promise<void>((resolve) => (releaseFeatures = resolve)).then(loadFeatures);
const Window = defineComponent(() => () =>
  h(LazyMotion, { features: loadSlowly }, () => h(MotionConfig, { skipAnimations: true }, () => h(Waiting))),
);

test('the list and the empty text swap on the real motion-v before its features have loaded without a render error', async () => {
  const failures: unknown[] = [];
  snapshot.turn = [backlogRow];
  const { container } = render(Window, { global: { config: { errorHandler: (failure: unknown) => failures.push(failure) } } });

  for (const turn of [[], [backlogRow], []]) {
    snapshot.turn = turn;
    await nextTick();
  }

  releaseFeatures();
  await screen.findByText(EMPTY);
  expect(container.querySelector('.waiting__table')).toBeNull();
  snapshot.turn = [backlogRow];
  await vi.waitFor(() => expect(container.querySelector('.waiting__table')).not.toBeNull());
  expect(screen.queryByText(EMPTY)).toBeNull();
  expect(failures).toEqual([]);
});
