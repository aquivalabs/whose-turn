// motion-v stand-in for the Vitest tier: plain tags, instant exits. docs/adr/0009-motion-in-the-window.md § Tests stub the library
import { h } from 'vue';
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

export const AnimatePresence = passThrough;
export const MotionConfig = passThrough;
export const animate = () => Promise.resolve();
