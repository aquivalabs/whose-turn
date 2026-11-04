// motion-v stand-in for the Vitest tier: plain tags, instant exits. docs/mechanisms/motion.md § The test stand-in
import { h, Transition, TransitionGroup } from 'vue';
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
 * Exits finish at once and AnimatePresence is a plain pass-through, until a test calls `exits.hold()`: from then on
 * AnimatePresence is built on Vue's own Transition (mode wait) or TransitionGroup like the real one, and every exit
 * stays open until `exits.release()`.
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
    this.real = false;
  },
  real: false,
};

const onLeave = (_element: Element, done: () => void) => (exits.held ? exits.pending.push(done) : done());

export const AnimatePresence = (props: Record<string, unknown>, { slots, attrs }: SetupContext) => {
  exits.real ||= exits.held;
  if (!exits.real) {
    return slots.default?.();
  }
  const shared = { ...attrs, css: false, onLeave };
  return props.mode === 'wait'
    ? h(Transition, { ...shared, mode: 'out-in' }, slots.default)
    : h(TransitionGroup, shared, slots.default);
};
AnimatePresence.props = ['mode', 'initial'];
AnimatePresence.inheritAttrs = false;

export const MotionConfig = passThrough;
export const LazyMotion = passThrough;
export const animate = () => Promise.resolve();
export { Motion as M };
