// motion-v stand-in for the Vitest tier: plain tags, instant exits. docs/mechanisms/motion.md § The test stand-in
import { h, TransitionGroup } from 'vue';
import type { SetupContext } from 'vue';

const SWALLOWED = ['initial', 'animate', 'exit', 'layout', 'transition', 'whileHover', 'whilePress'];

export const Motion = (props: Record<string, unknown>, { slots }: SetupContext) => {
  const { as: tag = 'div', ...attrs } = props;
  for (const name of SWALLOWED) {
    delete attrs[name];
  }
  return h(tag as string, attrs, slots.default?.());
};

const passThrough = (_props: Record<string, unknown>, { slots }: SetupContext) => slots.default?.();
passThrough.inheritAttrs = false;

/**
 * AnimatePresence is Vue's own TransitionGroup, like the real one, and reports `exit-complete`. Exits finish at once,
 * until a test calls `exits.hold()`: every exit then stays open until `exits.release()`.
 */
export const exits = {
  held: false,
  pending: [] as Array<() => void>,
  hold() {
    this.held = true;
  },
  release() {
    this.held = false;
    this.pending.splice(0).forEach((done) => done());
  },
  reset() {
    this.held = false;
    this.pending.length = 0;
  },
};

const leave = (props: Record<string, unknown>) => (_element: Element, done: () => void) => {
  const finish = () => {
    done();
    (props.onExitComplete as (() => void) | undefined)?.();
  };
  return exits.held ? exits.pending.push(finish) : finish();
};

export const AnimatePresence = (props: Record<string, unknown>, { slots, attrs }: SetupContext) =>
  h(TransitionGroup, { ...attrs, css: false, onLeave: leave(props) }, slots.default);
AnimatePresence.props = ['mode', 'initial', 'onExitComplete'];
AnimatePresence.inheritAttrs = false;

export const MotionConfig = passThrough;
export const LazyMotion = passThrough;
export const animate = () => Promise.resolve();
export { Motion as M };
